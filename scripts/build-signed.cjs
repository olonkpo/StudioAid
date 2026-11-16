'use strict';
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
function requiredCredentials(platform,env){
 const keys=['CSC_LINK','CSC_KEY_PASSWORD',...(platform==='darwin'?['APPLE_ID','APPLE_APP_SPECIFIC_PASSWORD','APPLE_TEAM_ID']:[])];
 if(!['darwin','win32'].includes(platform))throw Error('Build signed installers on macOS or Windows.');
 const missing=keys.filter(k=>!env[k]);if(missing.length)throw Error('Signed build needs repository secrets for: '+missing.join(', ')+'. See docs/signing.md.');
}
async function main(){
 requiredCredentials(process.platform,process.env);
 const {build}=require('electron-builder');
 await build({publish:'never',config:{forceCodeSigning:true,...(process.platform==='darwin'?{mac:{hardenedRuntime:true,notarize:true}}:{})}});
 const dist=path.resolve('dist');
 if(process.platform==='darwin'){
  const apps=fs.readdirSync(dist,{withFileTypes:true}).filter(x=>x.isDirectory()&&x.name.startsWith('mac')).map(x=>path.join(dist,x.name,'StudioAid.app')).filter(x=>fs.existsSync(x));
  if(apps.length!==2)throw Error('Expected both Apple Silicon and Intel app bundles.');
  for(const app of apps){execFileSync('codesign',['--verify','--deep','--strict',app],{stdio:'inherit'});execFileSync('xcrun',['stapler','validate',app],{stdio:'inherit'});}
 }else{
  const installers=fs.readdirSync(dist).filter(x=>/^StudioAid-Setup-.*\.exe$/.test(x));if(!installers.length)throw Error('No signed Windows installer was produced.');
  const files=[...installers.map(x=>path.join(dist,x)),path.join(dist,'win-unpacked','StudioAid.exe')];
  for(const file of files)execFileSync('powershell',['-NoProfile','-NonInteractive','-Command',"$signature = Get-AuthenticodeSignature -LiteralPath $env:STUDIOAID_VERIFY_FILE; if ($signature.Status -ne 'Valid') { throw 'Installer signature verification failed' }"],{stdio:'inherit',env:{...process.env,STUDIOAID_VERIFY_FILE:file}});
 }
}
module.exports={requiredCredentials};
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
