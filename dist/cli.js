#!/usr/bin/env node
async function g(){let t=process.argv.slice(2);if(t.length===0||t[0]==="--help"||t[0]==="-h")console.log(`gh2md - Convert GitHub repos to markdown

Usage:
  gh2md <github-url>
  gh2md <owner/repo>
  gh2md <owner/repo/path>

Examples:
  gh2md https://github.com/honojs/hono
  gh2md honojs/hono
  gh2md honojs/hono/src
  gh2md https://github.com/honojs/hono/tree/main/src
  gh2md https://github.com/honojs/hono/blob/main/README.md`),process.exit(0);let o=t[0];if(!o.includes("github.com")){let e=o.split("/");if(e.length===2)o=`github.com/${o}`;else if(e.length>2){let[h,c,...i]=e;o=`github.com/${h}/${c}/tree/main/${i.join("/")}`}else o=`github.com/${o}`}let n=o.replace(/^https?:\/\//,""),s=await fetch(`https://repo2md.evm.workers.dev/${n}`);if(!s.ok){console.error(`Error: ${s.status} ${s.statusText}`);let e=await s.text();if(e)console.error(e);process.exit(1)}let r=await s.text();console.log(r)}g().catch((t)=>{console.error(t.message),process.exit(1)});
