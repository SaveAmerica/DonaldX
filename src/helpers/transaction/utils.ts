import * as cheerio from 'cheerio';

export async function handleXMigration(
  fetch: (input: RequestInfo, init?: RequestInit) => Promise<Response>
): Promise<cheerio.Root> {
  const migrationRedirectionRegex = new RegExp(
    '(http(?:s)?://(?:www\\.)?(twitter|x){1}\\.com(/x)?/migrate([/?])?tok=[a-zA-Z0-9%\\-_]+)+',
    'i'
  );
  
  let response = await fetch('https://x.com');
  let html = await response.text();
  let $ = cheerio.load(html);
  
  const migrationUrl = $('meta[http-equiv="refresh"]').attr('content');
  const migrationRedirectionUrl = 
    (migrationUrl && migrationRedirectionRegex.exec(migrationUrl)) || 
    migrationRedirectionRegex.exec(html);
  
  if (migrationRedirectionUrl) {
    response = await fetch(migrationRedirectionUrl[0]);
    html = await response.text();
    $ = cheerio.load(html);
  }
  
  const migrationForm = $('form[name="f"]').length ? 
    $('form[name="f"]') : 
    $('form[action="https://x.com/x/migrate"]');
  
  if (migrationForm.length) {
    const url = migrationForm.attr('action') || 'https://x.com/x/migrate';
    const method = migrationForm.attr('method') || 'POST';
    const requestPayload: Record<string, string> = {};
    
    migrationForm.find('input').each((index: number, element: any) => {
      const name = $(element).attr('name');
      const value = $(element).attr('value');
      if (name && value) {
        requestPayload[name] = value;
      }
    });
    
    const formData = new URLSearchParams();
    Object.entries(requestPayload).forEach(([key, value]) => {
      formData.append(key, value);
    });
    
    response = await fetch(url, {
      method,
      body: formData,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    
    html = await response.text();
    $ = cheerio.load(html);
  }
  
  return $;
}

export function floatToHex(x: number): string {
  const result: string[] = [];
  let quotient = Math.floor(x);
  let fraction = x - quotient;

  while (quotient > 0) {
    quotient = Math.floor(x / 16);
    const remainder = Math.floor(x - quotient * 16);

    if (remainder > 9) {
      result.unshift(String.fromCharCode(remainder + 55));
    } else {
      result.unshift(remainder.toString());
    }

    x = quotient;
  }

  if (fraction === 0) {
    return result.join('');
  }

  result.push('.');

  while (fraction > 0) {
    fraction *= 16;
    const integer = Math.floor(fraction);
    fraction -= integer;

    if (integer > 9) {
      result.push(String.fromCharCode(integer + 55));
    } else {
      result.push(integer.toString());
    }
  }

  return result.join('');
}

export function isOdd(num: number): number {
  return num % 2 ? -1.0 : 0.0;
}

export function base64Encode(data: string | Uint8Array): string {
  if (typeof data === 'string') {
    data = new TextEncoder().encode(data);
  }
  
  // In Cloudflare Workers, we can use the btoa function for base64 encoding
  return btoa(String.fromCharCode(...new Uint8Array(data)));
}

export function base64Decode(input: string): Uint8Array | string {
  try {
    const binary = atob(input);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    try {
      return new TextDecoder().decode(bytes);
    } catch (e) {
      return bytes;
    }
  } catch (e) {
    // Return input as bytes if it can't be decoded
    return new TextEncoder().encode(input);
  }
} 