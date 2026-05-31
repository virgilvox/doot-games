import { chromium } from 'playwright'
const BASE = process.env.B || 'https://doot.games'
const b = await chromium.launch()
const errs = []
const tv = await b.newContext({ viewport:{width:1280,height:800} })
const host = await tv.newPage()
host.on('console', m => { if (m.type()==='error') errs.push('HOST: '+m.text()) })
await host.goto(`${BASE}/host/circuit-cypher`, { waitUntil:'networkidle' })
await host.waitForSelector('.code',{timeout:30000})
const code = (await host.textContent('.code')).trim()
console.log('BASE', BASE, 'code', code)
const phone = await b.newContext({ viewport:{width:390,height:844}, isMobile:true })
const ps = []
for (const n of ['Ana','Ben']) {
  const p = await phone.newPage()
  p.on('console', m => { if (m.type()==='error') errs.push(`${n}: `+m.text()) })
  p.on('pageerror', e => errs.push(`${n} PAGEERROR: `+e.message))
  await p.goto(`${BASE}/play/${code}`); await p.waitForSelector('input')
  await p.locator('input').last().fill(n); await p.click('button:has-text("Join")')
  await p.waitForSelector('text=You are in',{timeout:30000}); ps.push(p)
}
await host.click('button:has-text("Start game")')
await host.waitForTimeout(1500)
// open the bars round
await host.locator('button:has-text("Collect answers"), button:has-text("Open voting")').first().click()
await host.waitForTimeout(3000)
for (let i=0;i<ps.length;i++){
  const txt = (await ps[i].locator('.player').innerText().catch(()=>'(no .player)')).replace(/\n+/g,' | ')
  const hasInput = await ps[i].locator('.bars-input').count()
  console.log(`PHONE ${i}: bars-input=${hasInput} text="${txt.slice(0,120)}"`)
}
console.log('HOST round view has bars-host:', await host.locator('.bars-host').count(), '| host body:', (await host.locator('.stage,.lobby').first().innerText().catch(()=>'?')).replace(/\n+/g,' | ').slice(0,100))
console.log('ERRORS:', errs.length ? errs.slice(0,8).join(' || ') : 'none')
await b.close()
