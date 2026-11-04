import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type VelarisProps = { bg?: string; colors?: string[]; speed?: number; grain?: number; height?: string | number; className?: string; children?: ReactNode };

const vertexShader = `
attribute vec2 position;
varying vec2 vUv;
void main(){ vUv=position*.5+.5; gl_Position=vec4(position,0.,1.); }
`;
const fragmentShader = `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform float uGrain;
uniform vec3 uColors[4];
uniform vec3 uBg;
float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){
 vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
 return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);
}
void main(){
 vec2 uv=vUv; float n=noise(uv*3.2+vec2(uTime*.08,-uTime*.045));
 float a=sin((uv.x*2.6+uv.y*1.7+uTime*.13+n)*3.14159)*.5+.5;
 float b=sin((uv.y*2.4-uv.x*1.8-uTime*.1+n*.7)*3.14159)*.5+.5;
 vec3 c=mix(uColors[0],uColors[1],smoothstep(.05,.95,a));
 c=mix(c,uColors[2],smoothstep(.15,.9,b)*.58);
 c=mix(c,uColors[3],smoothstep(.55,1.,n)*.22);
 c=mix(uBg,c,.92);
 float vignette=smoothstep(1.25,.18,length((uv-.5)*vec2(1.,.85)));
 c*=.72+vignette*.28;
 c+=(hash(gl_FragCoord.xy+mod(uTime,100.))-.5)*uGrain;
 gl_FragColor=vec4(c,1.);
}
`;

function compile(gl: WebGLRenderingContext, type: number, source: string) {
 const shader=gl.createShader(type); if(!shader) throw new Error("Unable to create shader");
 gl.shaderSource(shader,source); gl.compileShader(shader);
 if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){ const msg=gl.getShaderInfoLog(shader)||"Shader compile failed"; gl.deleteShader(shader); throw new Error(msg); }
 return shader;
}
function toRgb(value: string): [number,number,number] {
 const ctx=document.createElement("canvas").getContext("2d"); if(!ctx) return [.3,.2,.6];
 ctx.fillStyle=value; const m=ctx.fillStyle.match(/\d+/g);
 return m&&m.length>=3?[+m[0]/255,+m[1]/255,+m[2]/255]:[.3,.2,.6];
}

export function Velaris({bg="#11102d",colors=["#8057e8","#3158c9","#bd64df","#4b9fe8"],speed=.5,grain=.12,height="100%",className,children}:VelarisProps){
 const canvasRef=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{
  const canvas=canvasRef.current; if(!canvas) return;
  const gl=canvas.getContext("webgl",{alpha:false,antialias:false,powerPreference:"low-power"}); if(!gl) return;
  let program:WebGLProgram|null=null, buffer:WebGLBuffer|null=null, frame=0;
  const reduced=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  try{
   const vs=compile(gl,gl.VERTEX_SHADER,vertexShader), fs=compile(gl,gl.FRAGMENT_SHADER,fragmentShader);
   program=gl.createProgram(); if(!program) throw new Error("Unable to create program");
   gl.attachShader(program,vs); gl.attachShader(program,fs); gl.linkProgram(program); gl.deleteShader(vs); gl.deleteShader(fs);
   if(!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program)||"Program link failed");
   gl.useProgram(program); buffer=gl.createBuffer(); if(!buffer) throw new Error("Unable to create buffer");
   gl.bindBuffer(gl.ARRAY_BUFFER,buffer); gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
   const pos=gl.getAttribLocation(program,"position"); gl.enableVertexAttribArray(pos); gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
   const timeLoc=gl.getUniformLocation(program,"uTime"), grainLoc=gl.getUniformLocation(program,"uGrain"), colorsLoc=gl.getUniformLocation(program,"uColors"), bgLoc=gl.getUniformLocation(program,"uBg");
   const palette=[...colors,...colors].slice(0,4).flatMap(toRgb);
   const resize=()=>{const dpr=Math.min(devicePixelRatio||1,1.75),w=Math.max(1,Math.floor(canvas.clientWidth*dpr)),h=Math.max(1,Math.floor(canvas.clientHeight*dpr));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h);}};
   const observer=typeof ResizeObserver!=="undefined"?new ResizeObserver(resize):null; observer?.observe(canvas); window.addEventListener("resize",resize); resize();
   const draw=(now:number)=>{resize();gl.useProgram(program);gl.uniform1f(timeLoc,reduced?0:now/1000*Math.max(0,speed));gl.uniform1f(grainLoc,Math.max(0,Math.min(grain,.5)));gl.uniform3fv(colorsLoc,new Float32Array(palette));gl.uniform3fv(bgLoc,new Float32Array(toRgb(bg)));gl.drawArrays(gl.TRIANGLE_STRIP,0,4);if(!reduced)frame=requestAnimationFrame(draw);};
   draw(performance.now());
   return ()=>{cancelAnimationFrame(frame);observer?.disconnect();window.removeEventListener("resize",resize);if(buffer)gl.deleteBuffer(buffer);if(program)gl.deleteProgram(program);gl.getExtension("WEBGL_lose_context")?.loseContext();};
  }catch(error){console.error("[Velaris] WebGL initialization failed:",error);gl.getExtension("WEBGL_lose_context")?.loseContext();}
 },[bg,colors.join("|"),speed,grain]);
 return <div className={cn("relative isolate overflow-hidden",className)} style={{height,background:bg}}><canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 h-full w-full"/><div className="relative z-10 h-full">{children}</div></div>;
}
