#!/usr/bin/env python3
"""Test real UI transitions using fictional learners and blocked network."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from functools import partial
from playwright.sync_api import sync_playwright
import json

ROOT=Path(__file__).resolve().parents[1]
KEY='remember-your-numbers-v1'
class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
    def translate_path(self,path):
        if path.startswith('/nested/project/'):path=path.removeprefix('/nested/project')
        return super().translate_path(path)

def main():
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=str(ROOT/'public')))
    Thread(target=server.serve_forever,daemon=True).start()
    origin=f'http://127.0.0.1:{server.server_port}'
    failures=[]
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch()
            def fresh(seed=None):
                context=browser.new_context(viewport={'width':390,'height':844});external=[];errors=[]
                context.route('**/*',lambda route:route.continue_() if route.request.url.startswith(origin+'/') else (external.append(route.request.url),route.abort()))
                context.add_init_script("window.testSpeech=[];Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[],cancel:()=>{},speak:u=>testSpeech.push(u.text),addEventListener:()=>{}}});window.SpeechSynthesisUtterance=function(text){this.text=text}")
                if seed is not None:context.add_init_script(f"localStorage.setItem({json.dumps(KEY)},{json.dumps(seed)})")
                page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(origin+'/')
                page.clock.install();page.clock.pause_at('2030-01-01T00:00:00Z')
                demo=page.get_by_role('button',name='Try the fictional demo',exact=True)
                if demo.count():demo.click()
                return context,page,external,errors
            context,page,external,errors=fresh()
            try:
                page.get_by_role('button',name='🚀 Nova',exact=True).click();page.get_by_role('button',name='Example phone',exact=False).click()
                for _ in range(2):
                    for chunk in ('202','555','0147'):page.get_by_role('button',name=chunk,exact=True).click()
                    if _==0:page.clock.fast_forward(700)
                page.get_by_role('button',name='← Back',exact=True).click();page.get_by_role('button',name='← Back',exact=True).click()
                page.get_by_role('button',name='🪐 Orion',exact=True).click();page.get_by_role('button',name='Example phone',exact=False).click()
                page.clock.fast_forward(1200)
                assert page.get_by_role('heading',name='Say it with me',exact=True).count()==1,'An abandoned learner completion credited the new learner'
                assert not errors,errors;assert not external,external
                print('PASS stale completion cannot cross learners',flush=True)
            except Exception as e:failures.append(str(e));print('FAIL stale completion:',str(e),flush=True)
            context.close()
            context,page,external,errors=fresh('null')
            try:
                assert page.get_by_role('heading',name='Remember Your Numbers',exact=True).count()==1,'Malformed storage crashed first use'
                assert not errors,errors;assert not external,external
                print('PASS null storage recovers safely',flush=True)
            except Exception as e:failures.append(str(e));print('FAIL null storage:',str(e),flush=True)
            context.close()
            # Walk the actual learning ladder, delayed proof, review doubling and miss recovery.
            fixture={'version':1,'profiles':[{'id':'comet','name':'Comet','emoji':'⭐','numbers':[{'id':'sample','label':'Example code','digits':'0123','chunks':[2,2]}]}]}
            seed=json.dumps({'format':'remember-your-numbers','version':1,'config':fixture,'store':{'muted':True,'progress':{}}})
            context,page,external,errors=fresh(seed)
            try:
                page.get_by_role('button',name='⭐ Comet',exact=True).click();page.get_by_role('button',name='Example code',exact=False).click()
                for _ in range(2):
                    for chunk in ('01','23'):page.get_by_role('button',name=chunk,exact=True).click()
                    page.clock.fast_forward(700)
                page.get_by_role('button',name='Next challenge →',exact=True).click()
                for chunk in ('23','01'):
                    page.get_by_role('button',name=chunk,exact=True).click();page.clock.fast_forward(900)
                for digits in ('23','0123','123','0123'):
                    page.get_by_role('button',name='Next challenge →',exact=True).click()
                    for digit in digits:page.keyboard.press(digit)
                    page.clock.fast_forward(900)
                assert page.get_by_text('Come back tomorrow to prove you still know it!',exact=True).count()==1
                page.clock.fast_forward(20*60*60*1000)
                for iteration,delay in enumerate((0,2*24*60*60*1000,4*24*60*60*1000)):
                    if delay:page.clock.fast_forward(delay)
                    page.get_by_role('button',name='Back to my numbers',exact=True).click();page.get_by_role('button',name='Example code',exact=False).click()
                    if iteration==2:page.keyboard.press('9')
                    for digit in '0123':page.keyboard.press(digit)
                    # Duplicate final input must not double the review interval.
                    page.get_by_role('button',name='3',exact=True).click();page.clock.fast_forward(1200)
                    saved=json.loads(page.evaluate('(key)=>localStorage.getItem(key)',KEY));progress=saved['store']['progress']['comet']['sample']
                    assert progress['mastered'] is True
                    assert progress['reviewIntervalMs']==(4 if iteration==1 else 2)*24*60*60*1000,progress
                assert not page.evaluate('testSpeech'),'Default play spoke before opt-in'
                assert not external,external;assert not errors,errors
                print('PASS full teaching ladder, delayed proof, review intervals, duplicate final input and miss recovery',flush=True)
            except Exception as e:failures.append(str(e));print('FAIL teaching ladder:',str(e),flush=True)
            context.close()
            # Nontechnical setup, leading zeros, malformed import, real file export and explicit reset.
            context,page,external,errors=fresh()
            try:
                page.get_by_role('button',name='Add my own numbers',exact=True).click()
                page.get_by_label('Nickname',exact=True).fill('Comet');page.get_by_label('Label',exact=True).fill('Example code')
                page.get_by_label('Digits (leading zeros are kept)',exact=True).fill('001728');page.get_by_label('Chunk sizes',exact=True).fill('3, 3')
                page.get_by_role('button',name='Save setup',exact=True).click()
                page.get_by_role('button',name='⭐ Comet',exact=True).wait_for()
                saved=json.loads(page.evaluate('(key)=>localStorage.getItem(key)',KEY));assert saved['config']['profiles'][0]['numbers'][0]['digits']=='001728'
                page.reload();assert page.get_by_role('button',name='⭐ Comet',exact=True).count()==1
                page.get_by_role('button',name='Setup and backups',exact=True).click()
                with page.expect_download() as received:page.get_by_role('button',name='Export backup',exact=True).click()
                backup=json.loads(Path(received.value.path()).read_text());assert backup==saved
                original=page.evaluate('(key)=>localStorage.getItem(key)',KEY)
                bad=json.loads(json.dumps(backup));bad['config']['profiles'][0]['numbers'][0]['chunks']=[90]
                page.get_by_label('Import a backup',exact=True).set_input_files({'name':'invalid.json','mimeType':'application/json','buffer':json.dumps(bad).encode()})
                page.get_by_role('alert').filter(has_text='Import failed').wait_for()
                assert page.evaluate('(key)=>localStorage.getItem(key)',KEY)==original
                page.once('dialog',lambda dialog:dialog.accept())
                page.get_by_label('Import a backup',exact=True).set_input_files({'name':'synthetic-backup.json','mimeType':'application/json','buffer':json.dumps(backup).encode()})
                page.get_by_role('button',name='⭐ Comet',exact=True).wait_for()
                page.get_by_role('button',name='Turn sound on',exact=True).click();assert page.get_by_text('No local speech voice is available yet.',exact=False).count()==1
                assert not page.evaluate('testSpeech')
                page.get_by_role('button',name='Setup and backups',exact=True).click()
                page.once('dialog',lambda dialog:dialog.dismiss());page.get_by_role('button',name='Erase this browser’s setup and progress',exact=True).click()
                assert page.evaluate('(key)=>localStorage.getItem(key)',KEY)==original
                page.once('dialog',lambda dialog:dialog.accept());page.get_by_role('button',name='Erase this browser’s setup and progress',exact=True).click()
                page.get_by_role('button',name='🚀 Nova',exact=True).wait_for()
                assert page.evaluate('(key)=>localStorage.getItem(key)',KEY) is None
                assert page.get_by_role('button',name='🚀 Nova',exact=True).count()==1
                assert not external,external;assert not errors,errors
                print('PASS setup/reload, leading zeros, export/import validation, silent fallback and confirmed erase',flush=True)
            except Exception as e:failures.append(str(e));print('FAIL setup and backups:',str(e),flush=True)
            context.close()
            context,page,external,errors=fresh(seed)
            try:
                other=context.new_page();other.goto(origin+'/');other.clock.install();other.clock.pause_at('2030-01-01T00:00:00Z')
                other.get_by_role('button',name='⭐ Comet',exact=True).click();other.get_by_role('button',name='Example code',exact=False).click()
                for iteration in range(2):
                    for chunk in ('01','23'):other.get_by_role('button',name=chunk,exact=True).click()
                    if iteration==0:other.clock.fast_forward(700)
                page.get_by_role('button',name='Setup and backups',exact=True).click();page.once('dialog',lambda dialog:dialog.accept());page.get_by_role('button',name='Erase this browser’s setup and progress',exact=True).click()
                page.wait_for_function('(key)=>localStorage.getItem(key)===null',arg=KEY)
                other.clock.fast_forward(1200)
                assert page.evaluate('(key)=>localStorage.getItem(key)',KEY) is None,'Stale tab resurrected erased learner data'
                assert not external,external
                print('PASS other tab cannot resurrect erased setup',flush=True)
            except Exception as e:failures.append(str(e));print('FAIL cross-tab erase:',str(e),flush=True)
            context.close()
            # The exact downloadable file works with every HTTP request blocked.
            offline=browser.new_context(viewport={'width':390,'height':844});requests=[];offline_errors=[]
            offline.route('http://**/*',lambda route:(requests.append(route.request.url),route.abort()))
            offline.route('https://**/*',lambda route:(requests.append(route.request.url),route.abort()))
            tab=offline.new_page();tab.on('pageerror',lambda e:offline_errors.append(str(e)));tab.goto((ROOT/'artifacts/Remember-Your-Numbers.html').as_uri())
            tab.get_by_role('button',name='Add my own numbers',exact=True).click()
            tab.get_by_label('Nickname',exact=True).fill('Comet');tab.get_by_label('Label',exact=True).fill('Example code');tab.get_by_label('Digits (leading zeros are kept)',exact=True).fill('001728');tab.get_by_label('Chunk sizes',exact=True).fill('3,3');tab.get_by_role('button',name='Save setup',exact=True).click();tab.get_by_role('button',name='⭐ Comet',exact=True).wait_for()
            tab.reload();tab.get_by_role('button',name='⭐ Comet',exact=True).click();tab.get_by_role('button',name='Example code',exact=False).click();tab.get_by_role('button',name='001',exact=True).click()
            out=ROOT/'artifacts/browser-checks';out.mkdir(parents=True,exist_ok=True)
            for width in (320,390,768,1440):
                tab.set_viewport_size({'width':width,'height':844});assert tab.evaluate('document.documentElement.scrollWidth<=innerWidth'),width;tab.screenshot(path=str(out/f'learn-{width}.png'),full_page=True)
            tab.get_by_role('button',name='← Back',exact=True).click();tab.get_by_role('button',name='← Back',exact=True).click();tab.get_by_role('button',name='Setup and backups',exact=True).click();tab.set_viewport_size({'width':320,'height':844});assert tab.evaluate('document.documentElement.scrollWidth<=innerWidth');tab.screenshot(path=str(out/'setup-320.png'),full_page=True)
            tab.get_by_role('button',name='Credits and licenses',exact=True).click();assert tab.get_by_text('SIL OPEN FONT LICENSE Version 1.1',exact=False).count()>=1
            assert not requests,requests;assert not offline_errors,offline_errors;offline.close();print('PASS exact standalone file, saved setup reload, 320–1440 layouts and credits with zero external requests',flush=True)
            # Root-relative mistakes would fail this nested deployment.
            nested=browser.new_context();urls=[];tab=nested.new_page();tab.on('request',lambda request:urls.append(request.url));tab.goto(origin+'/nested/project/');tab.get_by_role('button',name='🚀 Nova',exact=True).click();tab.get_by_role('button',name='Example phone',exact=False).click();tab.get_by_role('button',name='202',exact=True).click();assert all(url.startswith(origin+'/nested/project/') for url in urls),urls;nested.close();print('PASS nested project hosting',flush=True)
            # Storage failure is visible; in-memory play and exports remain usable.
            context=browser.new_context();tab=context.new_page();tab.add_init_script("Storage.prototype.setItem=function(){throw new DOMException('Full','QuotaExceededError')}");tab.goto(origin+'/');tab.get_by_role('button',name='Add my own numbers',exact=True).click();tab.get_by_label('Nickname',exact=True).fill('Comet');tab.get_by_label('Label',exact=True).fill('Example code');tab.get_by_label('Digits (leading zeros are kept)',exact=True).fill('001728');tab.get_by_label('Chunk sizes',exact=True).fill('3,3');tab.get_by_role('button',name='Save setup',exact=True).click();tab.get_by_role('button',name='⭐ Comet',exact=True).wait_for();assert 'temporary' in tab.locator('#save-notice').inner_text();tab.get_by_role('button',name='Setup and backups',exact=True).click()
            with tab.expect_download() as received:tab.get_by_role('button',name='Export backup',exact=True).click()
            assert json.loads(Path(received.value.path()).read_text())['config']['profiles'][0]['name']=='Comet';context.close();print('PASS storage failure keeps a visible temporary session and export',flush=True)
            browser.close()
    finally:server.shutdown();server.server_close()
    assert not failures,failures

if __name__=='__main__':main()
