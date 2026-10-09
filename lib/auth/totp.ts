import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function newTotpSecret() {
  let bits=0,value=0,out="";
  for (const byte of randomBytes(20)) { value=(value<<8)|byte;bits+=8;while(bits>=5){bits-=5;out+=ALPHABET[(value>>>bits)&31];} }
  return out;
}
function decode(secret:string) {
  let bits=0,value=0;const bytes:number[]=[];
  for (const char of secret.toUpperCase().replace(/=+$/, "")) {
    const index=ALPHABET.indexOf(char);if(index<0)throw new Error("Invalid secret");
    value=(value<<5)|index;bits+=5;if(bits>=8){bits-=8;bytes.push((value>>>bits)&255);}
  }
  return Buffer.from(bytes);
}
/** RFC 6238, SHA-1, 30 second step; 8 digits supported for published test vectors. */
export function totp(secret:string,counter:number,digits=6) {
  const message=Buffer.alloc(8);message.writeBigUInt64BE(BigInt(counter));
  const hash=createHmac("sha1",decode(secret)).update(message).digest();
  const offset=hash[hash.length-1]&15;
  return String((hash.readUInt32BE(offset)&0x7fffffff) % 10**digits).padStart(digits,"0");
}
export function matchTotp(secret:string,code:string,lastCounter:number,now=Date.now()) {
  if(!/^\d{6}$/.test(code))return null;
  const current=Math.floor(now/30000);
  for(const step of [current,current-1,current+1])
    if(step>lastCounter && timingSafeEqual(Buffer.from(totp(secret,step)),Buffer.from(code)))return step;
  return null;
}
