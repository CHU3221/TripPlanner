import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

const node=process.execPath
const children=[]
function start(args,label){const child=spawn(node,args,{stdio:'inherit',env:process.env,cwd:process.cwd()});child.on('exit',code=>{if(code&&code!==0)console.error(`${label} exited with ${code}`)});children.push(child)}
start(['server/index.mjs'],'backend')
start([path.join('node_modules','vite','bin','vite.js')],'vite')
function shutdown(){for(const child of children)if(!child.killed)child.kill('SIGTERM');setTimeout(()=>process.exit(0),100).unref()}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown)
