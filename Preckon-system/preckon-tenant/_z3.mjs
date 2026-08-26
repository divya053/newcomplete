import { chromium } from "@playwright/test";
const b = await chromium.launch();
let bad = 0;
for (const [w,h] of [[2560,1440],[1920,1080],[1600,900],[1500,900],[1500,760],[1440,900],[1366,768],[1366,700],[1280,800],[1024,768],[960,600],[1280,620],[390,844]]) {
  const p = await b.newPage({ viewport:{ width:w, height:h } });
  await p.goto("http://localhost:3100/login"); await p.waitForTimeout(500);
  const n = await p.locator(".login-bgmark").count();
  const vis = n ? await p.locator(".login-bgmark").isVisible() : false;
  if (!vis) { console.log(`${w}x${h}`.padEnd(11) + "logo hidden (by design)"); await p.close(); continue; }
  const m = await p.locator(".login-bgmark").boundingBox();
  const c = await p.locator(".login").boundingBox();
  const clash = (m.x+m.width>c.x) && (m.y+m.height>c.y);
  if (clash) bad++;
  console.log(`${w}x${h}`.padEnd(11) + `logo w${Math.round(m.width)} y${Math.round(m.y)}..${Math.round(m.y+m.height)} | card y${Math.round(c.y)} | ${clash?"*** OVERLAP ***":"clear"}`);
  await p.close();
}
console.log(bad === 0 ? "\nall clear" : `\n${bad} overlapping`);
await b.close();
