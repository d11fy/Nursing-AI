import 'server-only';
import {mkdtemp,writeFile,readFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const execute=promisify(execFile);
export async function renderSlides(buffer:Buffer):Promise<Buffer|null>{
 const paths=[process.env.LIBREOFFICE_PATH,...(process.platform==='win32'?['C:/Program Files/LibreOffice/program/soffice.exe','C:/Program Files (x86)/LibreOffice/program/soffice.exe']:['/usr/bin/libreoffice','/usr/bin/soffice'])].filter(Boolean) as string[];
 let executable:string|undefined;for(const path of paths){try{await access(path);executable=path;break;}catch{}}
 if(!executable)return null;
 const directory=await mkdtemp(join(tmpdir(),'nursing-slides-'));
 try{const input=join(directory,'slides.pptx');await writeFile(input,buffer);await execute(executable,['--headless',`-env:UserInstallation=${pathToFileURL(join(directory,'profile')).href}`,'--convert-to','pdf','--outdir',directory,input],{timeout:120000,windowsHide:true,maxBuffer:1024*1024});return await readFile(join(directory,'slides.pdf'));}
 finally{const absolute=resolve(directory);if(resolve(join(absolute,'..'))===resolve(tmpdir())&&basename(absolute).startsWith('nursing-slides-'))await rm(absolute,{recursive:true,force:true});}
}
