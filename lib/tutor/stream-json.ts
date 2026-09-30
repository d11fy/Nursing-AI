/** Emits ONLY the first JSON answer string. Handles escape sequences split across network events. */
export class AnswerStreamDecoder {
  private buffer=''; private offset=0; private started=false; private ended=false;
  push(delta:string):string {
    this.buffer+=delta;
    if(!this.started) {
      const match=/^\s*\{\s*"answer"\s*:\s*"/.exec(this.buffer);
      if(!match) return '';
      this.started=true; this.offset=match[0].length;
    }
    if(this.ended) return '';
    let output='';
    while(this.offset<this.buffer.length) {
      const ch=this.buffer[this.offset];
      if(ch==='"') {this.ended=true;break;}
      if(ch==='\\') {
        if(this.offset+1>=this.buffer.length) break;
        const escaped=this.buffer[this.offset+1];
        if(escaped==='u') {
          if(this.offset+6>this.buffer.length) break;
          output+=JSON.parse(`"${this.buffer.slice(this.offset,this.offset+6)}"`);this.offset+=6;
        } else { output+=JSON.parse(`"${this.buffer.slice(this.offset,this.offset+2)}"`);this.offset+=2; }
      } else {output+=ch;this.offset++;}
    }
    return output;
  }
}
