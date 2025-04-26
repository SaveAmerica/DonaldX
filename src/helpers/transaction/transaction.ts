import * as cheerio from 'cheerio';
import { Cubic } from './cubic_curve';
import { interpolate } from './interpolate';
import { convertRotationToMatrix } from './rotation';
import { floatToHex, isOdd, base64Encode } from './utils';

// Regular expressions for finding required elements
const ON_DEMAND_FILE_REGEX = new RegExp(
  "['|\"]ondemand\\.s['|\"]:\\s*['|\"](\\w*)['|\"]",
  'i'
);
const INDICES_REGEX = new RegExp(
  "(\\(\\w{1}\\[(\\d{1,2})\\],\\s*16\\))+",
  'i'
);

export class ClientTransaction {
  private static ADDITIONAL_RANDOM_NUMBER = 3;
  private static DEFAULT_KEYWORD = "obfiowerehiring";
  
  private defaultRowIndex: number | null = null;
  private defaultKeyBytesIndices: number[] | null = null;
  private homePage: cheerio.Root;
  private key!: string;
  private keyBytes!: Uint8Array;
  private animationKey!: string;

  /**
   * Static factory method to create a ClientTransaction instance asynchronously
   * @param homePageResponse - The X/Twitter homepage HTML response 
   * @param customFetch - Optional custom fetch function
   * @returns A Promise that resolves to a ClientTransaction instance
   */
  public static async create(
    homePageResponse: string | cheerio.Root,
    customFetch?: (input: RequestInfo, init?: RequestInit) => Promise<Response>
  ): Promise<ClientTransaction> {
    const instance = new ClientTransaction(homePageResponse);
    
    try {
      // Try to fetch the indices dynamically
      if (customFetch) {
        const [rowIndex, keyBytesIndices] = await instance.getIndicesWithFetch(customFetch);
        instance.defaultRowIndex = rowIndex;
        instance.defaultKeyBytesIndices = keyBytesIndices;
      }
    } catch (error) {
      console.warn('Failed to fetch indices dynamically, using fallback values:', error);
      // Use fallback values if fetching fails
      instance.defaultRowIndex = 2;
      instance.defaultKeyBytesIndices = [12, 14, 7];
    }
    
    try {
      instance.key = instance.getKey();
      
      if (!instance.key) {
        throw new Error("Empty key returned from getKey");
      }
      
      instance.keyBytes = instance.getKeyBytes(instance.key);
      instance.animationKey = instance.getAnimationKey(instance.keyBytes);
    } catch (error) {
      console.error('Failed to initialize key data:', error);
      
      // Use fallback values if we can't extract from the page
      // Generate a dummy key for testing/fallback purposes
      const fallbackKey = "TWVudGlvbmVkQnlPYnNlcnZlcjwzRGV2ZWxvcG1lbnQ="; // Base64 dummy
      instance.key = fallbackKey;
      instance.keyBytes = instance.getKeyBytes(fallbackKey);
      instance.animationKey = "1e00f00"; // Simple fallback animation key
    }
    
    return instance;
  }

  /**
   * Private constructor - use ClientTransaction.create() instead
   * @param homePageResponse - The X/Twitter homepage HTML response
   */
  private constructor(homePageResponse: string | cheerio.Root) {
    this.homePage = typeof homePageResponse === 'string' 
      ? cheerio.load(homePageResponse) 
      : homePageResponse;
  }

  /**
   * Gets the indices needed for calculations
   * @param fetch - The fetch function to use for requests
   * @returns An array containing [rowIndex, keyBytesIndices]
   */
  private async getIndicesWithFetch(
    fetch: (input: RequestInfo, init?: RequestInit) => Promise<Response>
  ): Promise<[number, number[]]> {
    const keyByteIndices: number[] = [];
    const html = this.homePage.html();
    const onDemandFile = ON_DEMAND_FILE_REGEX.exec(html);
    
    if (!onDemandFile || !onDemandFile[1]) {
      throw new Error("Couldn't find ondemand.s file reference in the page");
    }
    
    const onDemandFileUrl = `https://abs.twimg.com/responsive-web/client-web/ondemand.s.${onDemandFile[1]}a.js`;
    const response = await fetch(onDemandFileUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch ondemand file: ${response.status} ${response.statusText}`);
    }
    
    const text = await response.text();
    const matchesIterator = text.matchAll(new RegExp(INDICES_REGEX.source, 'gi'));
    const matches = Array.from(matchesIterator);
    
    for (const match of matches) {
      if (match[2]) {
        keyByteIndices.push(parseInt(match[2], 10));
      }
    }
    
    if (keyByteIndices.length === 0) {
      throw new Error("Couldn't extract KEY_BYTE indices from ondemand file");
    }
    
    return [keyByteIndices[0], keyByteIndices.slice(1)];
  }

  /**
   * Gets the key from the page
   * @returns The extracted key
   */
  private getKey(): string {
    try {
      const element = this.homePage('meta[name="twitter-site-verification"]');
      if (!element || !element.length) {
        throw new Error("Couldn't find meta[name='twitter-site-verification'] element");
      }
      
      const content = element.attr('content');
      if (!content) {
        throw new Error("meta[name='twitter-site-verification'] has no content attribute");
      }
      
      return content;
    } catch (error) {
      console.error('Error in getKey:', error);
      throw new Error(`Failed to extract key from page: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Converts a key string to byte array
   * @param key - The key string
   * @returns Byte array
   */
  private getKeyBytes(key: string): Uint8Array {
    return new Uint8Array(
      atob(key).split('').map(char => char.charCodeAt(0))
    );
  }

  /**
   * Gets the animation frames from the page
   * @returns The animation frames
   */
  private getFrames(): cheerio.Cheerio {
    const frames = this.homePage('[id^="loading-x-anim"]');
    if (!frames.length) {
      console.warn("No animation frames found with selector '[id^=\"loading-x-anim\"]'");
    }
    return frames;
  }

  /**
   * Extracts a 2D array from the animation frames
   * @param keyBytes - The key bytes
   * @param frames - The animation frames
   * @returns 2D array of values
   */
  private get2DArray(keyBytes: Uint8Array, frames?: cheerio.Cheerio): number[][] {
    if (!keyBytes || keyBytes.length < 6) {
      throw new Error("Invalid keyBytes: array too short");
    }
    
    if (!frames) {
      frames = this.getFrames();
    }
    
    if (!frames.length) {
      // Return a default array with some data if no frames found
      return [[0, 0, 0, 255, 255, 255, 120, 100, 100, 0, 0, 1]];
    }
    
    const frameIndex = keyBytes[5] % Math.max(frames.length, 1);
    const frame = frames.eq(frameIndex);
    
    if (!frame || frame.length === 0) {
      console.warn(`Frame at index ${frameIndex} is missing`);
      // Return a default array with some data
      return [[0, 0, 0, 255, 255, 255, 120, 100, 100, 0, 0, 1]];
    }
    
    const path = frame.find('path');
    if (!path || path.length === 0) {
      console.warn(`No path element found in frame ${frameIndex}`);
      // Return a default array with some data
      return [[0, 0, 0, 255, 255, 255, 120, 100, 100, 0, 0, 1]];
    }
    
    const pathData = path.attr('d');
    if (!pathData) {
      console.warn(`No 'd' attribute found on path in frame ${frameIndex}`);
      // Return a default array with some data
      return [[0, 0, 0, 255, 255, 255, 120, 100, 100, 0, 0, 1]];
    }
    
    // Ensure we have enough data to substring from
    if (pathData.length < 10) {
      console.warn(`Path data too short: "${pathData}"`);
      // Return a default array with some data
      return [[0, 0, 0, 255, 255, 255, 120, 100, 100, 0, 0, 1]];
    }
    
    const pathSegments = pathData.substring(9).split('C');
    
    const result = pathSegments.map((item: string) => {
      return item.replace(/[^\d]+/g, ' ').trim().split(' ')
        .filter((x: string) => x.length > 0)
        .map((x: string) => parseInt(x, 10));
    });
    
    // Make sure we have at least one row with enough data
    if (result.length === 0 || result[0].length < 7) {
      console.warn(`Insufficient data in path segments: ${JSON.stringify(result)}`);
      // Return a default array with some data
      return [[0, 0, 0, 255, 255, 255, 120, 100, 100, 0, 0, 1]];
    }
    
    return result;
  }

  /**
   * Solves a value within a range
   * @param value - The value to solve
   * @param minVal - The minimum value
   * @param maxVal - The maximum value
   * @param rounding - Whether to round the result
   * @returns The solved value
   */
  private solve(value: number, minVal: number, maxVal: number, rounding: boolean): number {
    const result = value * (maxVal - minVal) / 255 + minVal;
    return rounding ? Math.floor(result) : Number(result.toFixed(2));
  }

  /**
   * Animates the frames to get the animation key
   * @param frames - The frames to animate
   * @param targetTime - The target time
   * @returns The animation key
   */
  private animate(frames: number[], targetTime: number): string {
    try {
      if (!frames || frames.length < 7) {
        throw new Error(`Invalid frames data: ${JSON.stringify(frames)}`);
      }
      
      const fromColor = frames.slice(0, 3).map(Number).concat(1);
      const toColor = frames.slice(3, 6).map(Number).concat(1);
      const fromRotation = [0.0];
      const toRotation = [this.solve(frames[6], 60.0, 360.0, true)];
      
      const curveValues = frames.slice(7).map((item: number, index: number) => 
        this.solve(Number(item), isOdd(index), 1.0, false)
      );
      
      if (curveValues.length < 4) {
        throw new Error("Insufficient curve values for cubic bezier");
      }
      
      const cubic = new Cubic(curveValues);
      const val = cubic.getValue(targetTime);
      
      let color = interpolate(fromColor, toColor, val) as number[];
      color = color.map((value: number) => value > 0 ? value : 0);
      
      const rotation = interpolate(fromRotation, toRotation, val) as number[];
      const matrix = convertRotationToMatrix(rotation[0]);
      
      const strArr: string[] = color.slice(0, -1).map((value: number) => 
        Math.round(value).toString(16)
      );
      
      for (const value of matrix) {
        let rounded = Number(value.toFixed(2));
        if (rounded < 0) {
          rounded = -rounded;
        }
        
        let hexValue = floatToHex(rounded);
        if (hexValue.startsWith('.')) {
          strArr.push(`0${hexValue.toLowerCase()}`);
        } else {
          strArr.push(hexValue || '0');
        }
      }
      
      strArr.push('0', '0');
      
      return strArr.join('').replace(/[.-]/g, '');
    } catch (error) {
      console.error('Error in animate:', error);
      // Return a simple fallback animation key
      return "1e00f00";
    }
  }

  /**
   * Gets the animation key
   * @param keyBytes - The key bytes
   * @returns The animation key
   */
  private getAnimationKey(keyBytes: Uint8Array): string {
    try {
      const totalTime = 4096;
      const arr = this.get2DArray(keyBytes);
      
      // Make sure rowIndex is valid and within bounds of the array
      let rowIndex = this.defaultRowIndex !== null 
        ? keyBytes[this.defaultRowIndex] % 16 
        : keyBytes[2] % 16;
      
      // Ensure rowIndex is within bounds of the array
      if (arr.length === 0) {
        throw new Error("No animation data found in the page");
      }
      
      // If rowIndex is out of bounds, use modulo to wrap around
      rowIndex = rowIndex % arr.length;
      
      let frameTime: number;
      if (this.defaultKeyBytesIndices !== null && this.defaultKeyBytesIndices.length > 0) {
        frameTime = this.defaultKeyBytesIndices.reduce(
          (acc: number, index: number) => acc * (keyBytes[index] % 16),
          1
        );
      } else {
        frameTime = keyBytes[12] % 16 * (keyBytes[14] % 16) * (keyBytes[7] % 16);
      }
      
      const frameRow = arr[rowIndex];
      if (!frameRow || frameRow.length < 7) {
        throw new Error(`Invalid frame row data at index ${rowIndex}`);
      }
      
      const targetTime = frameTime / totalTime;
      
      return this.animate(frameRow, targetTime);
    } catch (error) {
      console.error('Error in getAnimationKey:', error);
      // Return a fallback animation key
      return "1e00f00";
    }
  }

  /**
   * Generates a transaction ID
   * @param method - The HTTP method
   * @param path - The request path
   * @param timeNow - The current time (optional)
   * @returns The generated transaction ID
   */
  public async generateTransactionId(method: string, path: string, timeNow?: number): Promise<string> {
    // Validate keyBytes is available
    if (!this.keyBytes || !this.keyBytes.length) {
      throw new Error("keyBytes is undefined or empty. Make sure ClientTransaction was properly initialized.");
    }
    
    // Use current time if not provided
    timeNow = timeNow || Math.floor((Date.now() - 1682924400000) / 1000);
    
    // Create time bytes
    const timeNowBytes = new Uint8Array(4);
    for (let i = 0; i < 4; i++) {
      timeNowBytes[i] = (timeNow >> (i * 8)) & 0xFF;
    }
    
    // Create hash
    const encoder = new TextEncoder();
    const stringToHash = `${method}!${path}!${timeNow}${ClientTransaction.DEFAULT_KEYWORD}${this.animationKey}`;
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(stringToHash));
    const hashBytes = new Uint8Array(hashBuffer);
    
    // Random number for XOR operation
    const randomNum = Math.floor(Math.random() * 256);
    
    // Create final buffer
    const bytesArr = new Uint8Array(this.keyBytes.length + timeNowBytes.length + 16 + 1);
    bytesArr[0] = randomNum;
    
    let pos = 1;
    
    // Add key bytes
    for (let i = 0; i < this.keyBytes.length; i++) {
      bytesArr[pos++] = this.keyBytes[i] ^ randomNum;
    }
    
    // Add time bytes
    for (let i = 0; i < timeNowBytes.length; i++) {
      bytesArr[pos++] = timeNowBytes[i] ^ randomNum;
    }
    
    // Add hash bytes (first 16)
    for (let i = 0; i < 16; i++) {
      bytesArr[pos++] = hashBytes[i] ^ randomNum;
    }
    
    // Add additional number
    bytesArr[pos] = ClientTransaction.ADDITIONAL_RANDOM_NUMBER ^ randomNum;
    
    // Convert to base64 and strip padding
    return base64Encode(bytesArr).replace(/=/g, '');
  }
} 