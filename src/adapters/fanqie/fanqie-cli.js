#!/usr/bin/env node
/**
 * Fanqie CLI — Unified CLI for Fanqie Novel (番茄小说) writer automation.
 *
 * Subcommands:
 *   upload       Upload and publish chapter(s) to an existing book
 *   check-status Check chapter statuses for a book
 *   cleanup      Delete duplicate drafts for a book
 *   fetch-data   Fetch read/bookshelf/earn data via OpenCLI network
 *   create-book  Create a new book through the Fanqie writer backend
 *
 * Usage:
 *   node src/adapters/fanqie/fanqie-cli.js upload --book-id ID --file ch1.txt --title "第1章 标题"
 *   node src/adapters/fanqie/fanqie-cli.js check-status --book-id ID
 *   node src/adapters/fanqie/fanqie-cli.js cleanup --book-id ID --keep ITEM1,ITEM2
 *   node src/adapters/fanqie/fanqie-cli.js fetch-data --book-id ID
 */

const { execSync } = require('child_process');
const fs = require('fs');

// ─── Shared utilities ───────────────────────────────────────────────────────

function run(cmd) {
  try {
    // Detect environment: WSL vs MINGW64/Git Bash vs native Windows
    const isWsl = require('fs').existsSync('/proc/version') &&
      require('fs').readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft');
    const isMingw = process.platform === 'win32' || require('child_process').execSync('uname -s', { encoding: 'utf8' }).trim().startsWith('MINGW');

    let prefix;
    if (isWsl) {
      prefix = [
        'mkdir -p .codex-tmp/wsl-node-bin',
        'printf \'#!/bin/sh\\nexec "/mnt/c/Program Files/nodejs/node.exe" "$@"\\n\' > .codex-tmp/wsl-node-bin/node',
        'chmod +x .codex-tmp/wsl-node-bin/node',
        'export PATH="$(pwd)/.codex-tmp/wsl-node-bin:$PATH"'
      ].join('; ');
    } else if (isMingw) {
      // MINGW64/Git Bash: node is already in PATH as /c/Program Files/nodejs/node
      prefix = 'export PATH="/c/Program Files/nodejs:$PATH"';
    } else {
      prefix = '';
    }
    const fullCmd = prefix ? `${prefix}; ${cmd}` : cmd;
    return execSync(fullCmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], shell: 'bash' });
  } catch (e) {
    return e.stdout || e.stderr || e.message;
  }
}

function bashEscape(str) {
  return str.replace(/'/g, "'\\''");
}

function jsEscape(str) {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
}

function sleep(s) {
  const start = Date.now();
  while (Date.now() - start < s * 1000) {}
}

// ─── Browser eval helpers ───────────────────────────────────────────────────

function browserEval(js) {
  return run(`opencli browser fanqie eval '${bashEscape(js)}'`);
}

function browserOpen(url) {
  return run(`opencli browser fanqie open "${url}"`);
}

function removeTour() {
  browserEval("document.querySelector('#___reactour')?.remove();'removed'");
}

// ─── OpenCLI ref finder helpers ─────────────────────────────────────────────

function findRef(cmd) {
  const out = run(cmd);
  const lines = out.split('\n').filter(l => l.trim());
  const jsonLine = lines.find(l => l.trim().startsWith('{'));
  if (!jsonLine) {
    const lastLine = lines[lines.length - 1];
    if (lastLine) {
      try {
        const data = JSON.parse(lastLine);
        if (data.entries && data.entries.length > 0) return data.entries[0].ref;
      } catch (e) {}
    }
    return null;
  }
  try {
    const data = JSON.parse(jsonLine);
    if (data.entries && data.entries.length > 0) {
      return data.entries[0].ref;
    }
  } catch (e) {}
  return null;
}

function findRefByText(text) {
  return findRef(`opencli browser fanqie find --text "${text}"`);
}

function findRefByCss(selector) {
  return findRef(`opencli browser fanqie find --css "${selector}"`);
}

function findRefByCssWithText(selector, text) {
  const out = run(`opencli browser fanqie find --css "${selector}"`);
  const lines = out.split('\n').filter(l => l.trim());
  const jsonLine = lines.find(l => l.trim().startsWith('{'));
  if (!jsonLine) return null;
  try {
    const data = JSON.parse(jsonLine);
    if (data.entries) {
      const entry = data.entries.find(e => e.text === text);
      return entry ? entry.ref : null;
    }
  } catch (e) {}
  return null;
}

function closeCategoryModal() {
  const js = `(function(){
    var btn = document.querySelector('.category-modal .arco-modal-close-icon');
    if(!btn) return 'no close btn';
    var key = Object.keys(btn).find(k => k.startsWith('__reactFiber'));
    var fiber = btn[key];
    var handler = null;
    var p = fiber;
    while(p && !handler) {
      if(p.memoizedProps?.onClick) handler = p.memoizedProps.onClick;
      p = p.return;
    }
    if(!handler) return 'no handler';
    handler({preventDefault:function(){},stopPropagation:function(){},target:btn,currentTarget:btn,nativeEvent:{stopImmediatePropagation:function(){}}});
    return 'modal closed';
  })()`;
  return browserEval(js);
}

function opencliClick(ref) {
  return run(`opencli browser fanqie click ${ref}`);
}

function opencliFill(ref, text) {
  const escaped = text.replace(/"/g, '\\"');
  return run(`opencli browser fanqie fill ${ref} "${escaped}"`);
}

// ─── React fiber interaction ────────────────────────────────────────────────

function clickButtonByText(text) {
  const js = `(function(){
    var btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '${jsEscape(text)}');
    if(!btn) return 'no button';
    var reactKey = Object.keys(btn).find(k => k.startsWith('__reactFiber'));
    var fiber = reactKey ? btn[reactKey] : null;
    var clickHandler = null;
    var p = fiber;
    while(p && !clickHandler) {
      if(p.memoizedProps?.onClick) clickHandler = p.memoizedProps.onClick;
      p = p.return;
    }
    if(!clickHandler) return 'no handler';
    var fakeEvent = {preventDefault:function(){},stopPropagation:function(){},target:btn,currentTarget:btn,nativeEvent:{stopImmediatePropagation:function(){}}};
    clickHandler(fakeEvent);
    return 'clicked';
  })()`;
  return browserEval(js);
}

function fillInput(selector, value, placeholder) {
  const sel = selector || `input[placeholder="${placeholder}"]`;
  const js = `(function(){
    var inp = document.querySelector('${sel}');
    if(!inp) return 'not found';
    var reactKey = Object.keys(inp).find(k => k.startsWith('__reactFiber'));
    var fiber = inp[reactKey];
    var changeHandler = null;
    var p = fiber;
    while(p && !changeHandler) {
      if(p.memoizedProps?.onChange) changeHandler = p.memoizedProps.onChange;
      p = p.return;
    }
    if(!changeHandler) return 'no handler';
    inp.value = '${jsEscape(value)}';
    changeHandler({target:inp,currentTarget:inp,persist:function(){},preventDefault:function(){},stopPropagation:function(){},nativeEvent:{}});
    return 'filled';
  })()`;
  return browserEval(js);
}

// ─── Editor helpers ─────────────────────────────────────────────────────────

function clearEditor() {
  return browserEval(`window.adapter.setHTML('<p></p>'); 'cleared'`);
}

function pasteContent(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const base64 = Buffer.from(content).toString('base64');
  browserEval("window._base64Chunks=[];");
  const chunkSize = 6000;
  for (let i = 0; i < base64.length; i += chunkSize) {
    const chunk = base64.slice(i, i + chunkSize);
    browserEval(`window._base64Chunks.push('${chunk}');`);
  }
  const pasteJs = `(function(){
    var full = window._base64Chunks.join('');
    var text = atob(full);
    try { text = decodeURIComponent(escape(text)); } catch(e) {}
    if(window.adapter && window.adapter.pasteContent) {
      var editor = document.querySelector("[contenteditable=true]");
      if(editor) {
        var range = document.createRange();
        range.selectNodeContents(editor);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
      window.adapter.pasteContent(text);
      return 'pasted ' + text.length;
    }
    return 'no adapter';
  })()`;
  return browserEval(pasteJs);
}

function getPageState() {
  const js = `(function(){
    return JSON.stringify({
      url: location.href,
      title: document.querySelector('input[placeholder="请输入标题"]')?.value,
      adapterHtmlLen: window.adapter ? window.adapter.getHTML().length : -1
    });
  })()`;
  return browserEval(js);
}

// ─── Modal / popup helpers ──────────────────────────────────────────────────

function getModal() {
  const js = "var wrapper=document.querySelector('.arco-modal-wrapper');var mask=document.querySelector('.arco-modal-mask');var hasModal=!!(wrapper&&mask&&wrapper.style.display==='block');var text=(wrapper?.textContent?.trim()?.slice(0,300))||'';JSON.stringify({hasModal,text})";
  const out = browserEval(js);
  const line = out.split('\n').find(l => l.trim().startsWith('{"hasModal"'));
  if (!line) return { hasModal: false, text: '' };
  try { return JSON.parse(line); } catch { return { hasModal: false, text: '' }; }
}

function handlePopups() {
  for (let i = 0; i < 5; i++) {
    const modal = getModal();
    if (!modal.hasModal) break;
    if (modal.text.includes('错别字') || modal.text.includes('发布提示')) {
      console.log('  -> Clicking 提交');
      browserEval(`var m=document.querySelector('.arco-modal-wrapper');var btn=[...m?.querySelectorAll('button')||[]].find(b=>b.textContent.trim()==='提交');if(btn)btn.click();'submit'`);
    } else if (modal.text.includes('内容检测方式')) {
      console.log('  -> Clicking 仅基础检测');
      browserEval(`var m=document.querySelector('.arco-modal-wrapper');var btn=[...m?.querySelectorAll('button')||[]].find(b=>b.textContent.trim()==='仅基础检测');if(btn)btn.click();'basic'`);
    } else {
      console.log('  -> Unknown popup:', modal.text.slice(0, 60));
      break;
    }
    sleep(2);
  }
}

// ─── API helpers ────────────────────────────────────────────────────────────

function callPublishAPI(itemId, bookId, title, volumeId) {
  const js = `(async function() {
    try {
      var adapter = window.adapter;
      var html = adapter ? adapter.getHTML() : '';
      var formData = new FormData();
      formData.append('item_id', '${itemId}');
      formData.append('book_id', '${bookId}');
      formData.append('content', html);
      formData.append('timer_status', '0');
      formData.append('need_pay', '0');
      formData.append('volume_name', '第一卷：默认');
      formData.append('volume_id', '${volumeId}');
      formData.append('title', '${jsEscape(title)}');
      formData.append('timer_time', '');
      formData.append('publish_status', '1');
      formData.append('device_platform', 'pc');
      formData.append('speak_type', '0');
      formData.append('use_ai', 'false');
      formData.append('timer_chapter_preview', '[]');
      formData.append('has_chapter_ad', 'false');
      formData.append('chapter_ad_types', '');
      var res = await fetch('/api/author/publish_article/v0/', { method: 'POST', body: formData });
      var text = await res.text();
      return JSON.stringify({status: res.status, body: text});
    } catch(e) {
      return JSON.stringify({error: e.message});
    }
  })()`;
  return browserEval(js);
}

function callDeleteAPI(bookId, itemId) {
  const js = `(async function() {
    try {
      var formData = new FormData();
      formData.append('book_id', '${bookId}');
      formData.append('item_id', '${itemId}');
      var res = await fetch('/api/author/delete_article/v0/', { method: 'POST', body: formData });
      var text = await res.text();
      return JSON.stringify({status: res.status, body: text});
    } catch(e) {
      return JSON.stringify({error: e.message});
    }
  })()`;
  return browserEval(js);
}

// ─── Subcommand: upload ─────────────────────────────────────────────────────

function cmdUpload(args) {
  const bookId = args['book-id'];
  const volumeId = args['volume-id'] || '';
  const filePath = args['file'];
  const title = args['title'];
  const itemId = args['item-id'];
  const num = args['num'] || '1';

  if (!bookId || !filePath || !title) {
    console.error('Usage: upload --book-id ID --file PATH --title "TITLE" [--item-id ID] [--num N]');
    process.exit(1);
  }
  if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
    process.exit(1);
  }

  console.log(`Uploading "${title}" to book ${bookId}`);

  let targetUrl;
  if (itemId) {
    targetUrl = `https://fanqienovel.com/main/writer/${bookId}/publish/${itemId}?enter_from=modifydraft`;
    console.log('  Opening existing draft:', itemId);
  } else {
    targetUrl = `https://fanqienovel.com/main/writer/${bookId}/publish/?enter_from=newchapter`;
    console.log('  Creating new chapter draft');
  }

  browserOpen(targetUrl);
  sleep(5);
  removeTour();
  sleep(1);

  if (itemId) {
    // Reuse draft: clear and re-fill
    console.log('  Clearing editor...');
    console.log('  ', clearEditor().trim());
    sleep(1);
  }

  // Fill chapter number (first text input)
  console.log('  Filling chapter number...');
  console.log('  ', fillInput("input[type=text]", String(num), null).trim());
  sleep(1);

  // Fill title
  console.log('  Filling title...');
  console.log('  ', fillInput(null, title, '请输入标题').trim());
  sleep(1);

  // Paste content
  console.log('  Pasting content...');
  console.log('  ', pasteContent(filePath).trim());
  sleep(2);

  // Click next
  console.log('  Clicking next...');
  console.log('  ', clickButtonByText('下一步').trim());
  sleep(3);

  // Handle popups
  handlePopups();

  // Get itemId from URL if new draft
  let finalItemId = itemId;
  if (!finalItemId) {
    const stateOut = getPageState();
    const urlMatch = stateOut.match(/publish\/(\d+)/);
    finalItemId = urlMatch ? urlMatch[1] : '';
    console.log('  New itemId:', finalItemId);
  }

  if (!finalItemId) {
    console.error('  ERROR: No item_id found');
    process.exit(1);
  }

  // Call publish API
  console.log('  Calling publish API...');
  const apiResult = callPublishAPI(finalItemId, bookId, title, volumeId);
  console.log('  ', apiResult.trim());

  // Parse result
  const apiLine = apiResult.split('\n').find(l => l.trim().startsWith('{"status"'));
  if (apiLine) {
    try {
      const apiJson = JSON.parse(apiLine);
      const body = JSON.parse(apiJson.body);
      if (body.code === 0) {
        console.log('  ✅ Published successfully!');
        return { success: true, itemId: finalItemId };
      } else if (body.message?.includes('每日上限')) {
        console.log('  ⚠️ Daily limit exceeded');
        return { success: false, reason: 'daily_limit', itemId: finalItemId };
      } else {
        console.log('  ⚠️ Failed:', body.message);
        return { success: false, reason: body.message, itemId: finalItemId };
      }
    } catch (e) {
      console.log('  Failed to parse API response:', e.message);
      return { success: false, reason: 'parse_error', itemId: finalItemId };
    }
  }

  return { success: false, reason: 'unknown', itemId: finalItemId };
}

// ─── Subcommand: check-status ───────────────────────────────────────────────

function cmdCheckStatus(args) {
  const bookId = args['book-id'];
  if (!bookId) {
    console.error('Usage: check-status --book-id ID');
    process.exit(1);
  }

  console.log(`Checking chapter status for book ${bookId}`);

  browserOpen(`https://fanqienovel.com/main/writer/chapter-manage/${bookId}`);
  sleep(5);

  const js = `JSON.stringify([...document.querySelectorAll('tr')].map(r=>{const c=[...r.querySelectorAll('td')];return c.length>=4?{title:c[0]?.innerText?.trim(),status:c[2]?.innerText?.trim(),words:c[3]?.innerText?.trim()}:null}).filter(Boolean))`;
  const out = browserEval(js);
  const line = out.split('\n').find(l => l.trim().startsWith('['));
  if (line) {
    try {
      const chapters = JSON.parse(line);
      console.log(`\nFound ${chapters.length} chapters:`);
      for (const ch of chapters) {
        const icon = ch.words === '已发布' ? '✅' : ch.words === '审核中' ? '⏳' : '❓';
        console.log(`  ${icon} ${ch.title} | 状态:${ch.status} | ${ch.words}`);
      }
      return chapters;
    } catch (e) {
      console.error('Parse error:', e.message);
    }
  }
  console.log('Raw:', out.slice(0, 500));
  return [];
}

// ─── Subcommand: cleanup ────────────────────────────────────────────────────

function cmdCleanup(args) {
  const bookId = args['book-id'];
  const keepStr = args['keep'] || '';
  const keepIds = keepStr.split(',').filter(Boolean);

  if (!bookId) {
    console.error('Usage: cleanup --book-id ID --keep ITEM1,ITEM2');
    process.exit(1);
  }

  console.log(`Cleaning up drafts for book ${bookId}`);
  console.log('  Keeping:', keepIds.length ? keepIds.join(', ') : 'none specified (will list only)');

  // TODO: Implement full draft listing + auto-dedup logic
  // For now, manual mode: user provides item IDs to delete
  const deleteIds = (args['delete'] || '').split(',').filter(Boolean);

  for (const itemId of deleteIds) {
    console.log(`  Deleting ${itemId}...`);
    const out = callDeleteAPI(bookId, itemId);
    console.log('  ', out.trim());
    sleep(1);
  }

  console.log('Cleanup done.');
}

// ─── Subcommand: fetch-data ─────────────────────────────────────────────────

function cmdFetchData(args) {
  const bookId = args['book-id'];
  if (!bookId) {
    console.error('Usage: fetch-data --book-id ID');
    process.exit(1);
  }

  console.log(`Fetching data for book ${bookId}`);

  // Open book data page (correct URL format)
  browserOpen(`https://fanqienovel.com/main/writer/data?bookId=${bookId}`);
  sleep(5);

  // Check if page loaded correctly
  const titleOut = browserEval('document.title');
  const pageCheck = browserEval("document.body.innerText.includes('404 Not Found') ? '404' : 'ok'");
  if (pageCheck.trim().includes('404')) {
    console.error('ERROR: Page returned 404. Invalid bookId or URL.');
    process.exit(1);
  }

  // Check if book has data (signed contract)
  const hasData = browserEval("document.body.innerText.includes('作品未签约，暂无数据') ? 'no_data' : 'has_data'");
  if (hasData.trim().includes('no_data')) {
    console.log('Book is not signed or has no data yet.');
  }

  // Extract visible data from the page
  const dataJs = `(function() {
    const text = document.body.innerText;
    const lines = text.split(String.fromCharCode(10));
    const bookNameIdx = lines.findIndex(l => l.trim() === '当前作品');
    const bookName = bookNameIdx >= 0 ? (lines[bookNameIdx + 1] || '').trim() : '';
    const readIdx = lines.findIndex(l => l.trim() === '阅读人数');
    const readCount = readIdx >= 0 ? (lines[readIdx + 1] || '--').trim() : '--';
    const readingIdx = lines.findIndex(l => l.trim() === '在读人数');
    const readingCount = readingIdx >= 0 ? (lines[readingIdx + 1] || '--').trim() : '--';
    const scoreIdx = lines.findIndex(l => l.trim() === '作品评分');
    const score = scoreIdx >= 0 ? (lines[scoreIdx + 1] || '--').trim() : '--';
    const commentsIdx = lines.findIndex(l => l.trim() === '评论次数');
    const comments = commentsIdx >= 0 ? (lines[commentsIdx + 1] || '--').trim() : '--';
    const bookshelfIdx = lines.findIndex(l => l.trim() === '加书架人数');
    const bookshelf = bookshelfIdx >= 0 ? (lines[bookshelfIdx + 1] || '--').trim() : '--';
    const urgeIdx = lines.findIndex(l => l.trim() === '催更人数');
    const urge = urgeIdx >= 0 ? (lines[urgeIdx + 1] || '--').trim() : '--';
    const followIdx = lines.findIndex(l => l.trim() === '追更人数');
    const follow = followIdx >= 0 ? (lines[followIdx + 1] || '--').trim() : '--';
    return JSON.stringify({bookName, readCount, readingCount, score, comments, bookshelf, urge, follow});
  })()`;
  const dataOut = browserEval(dataJs);
  const jsonLine = dataOut.split('\n').find(l => l.trim().startsWith('{'));
  if (jsonLine) {
    try {
      const data = JSON.parse(jsonLine);
      console.log('\nBook data:');
      console.log(`  Book: ${data.bookName}`);
      console.log(`  阅读人数: ${data.readCount}`);
      console.log(`  在读人数: ${data.readingCount}`);
      console.log(`  作品评分: ${data.score}`);
      console.log(`  评论次数: ${data.comments}`);
      console.log(`  加书架人数: ${data.bookshelf}`);
      console.log(`  催更人数: ${data.urge}`);
      console.log(`  追更人数: ${data.follow}`);
    } catch (e) {
      console.log('Failed to parse data:', e.message);
    }
  }

  // Also try network capture (may not work if requests already completed)
  const netOut = run(`opencli browser fanqie network --filter "read,earn"`);
  // Extract JSON from output (skip warning lines, find the JSON object)
  const netLines = netOut.split('\n').filter(l => l.trim());
  const jsonStartIdx = netLines.findIndex(l => l.trim().startsWith('{'));
  if (jsonStartIdx >= 0) {
    const netJsonStr = netLines.slice(jsonStartIdx).join('\n');
    try {
      const netData = JSON.parse(netJsonStr);
      console.log('\nNetwork data:');
      console.log(`  Captured: ${netData.count} entries`);
      console.log(`  Filtered out: ${netData.filtered_out || 0}`);
      if (netData.entries && netData.entries.length > 0) {
        for (const entry of netData.entries.slice(0, 3)) {
          console.log(`  - ${entry.url || entry.key || 'unknown'}`);
        }
      } else {
        console.log('  No matching network requests found.');
      }
    } catch (e) {
      console.log('\nNetwork data (raw):');
      console.log(netJsonStr.slice(0, 1000));
    }
  }

  return jsonLine || '{}';
}

// ─── Subcommand: create-book ────────────────────────────────────────────────

function cmdCreateBook(args) {
  const title = args['title'];
  const genre = args['genre'] || '悬疑灵异';
  const synopsis = args['synopsis'] || '一部精彩的推理小说，带你走进谜团的世界。';
  const protagonist1 = args['protagonist1'] || '主角';
  const protagonist2 = args['protagonist2'] || '';
  const gender = args['gender'] || '男频';

  if (!title) {
    console.error('Usage: create-book --title "TITLE" [--genre 悬疑灵异] [--synopsis "xxx"] [--protagonist1 "name"] [--protagonist2 "name"] [--gender 男频|女频]');
    process.exit(1);
  }

  console.log(`Creating book: "${title}"`);

  // Step 1: Open book manage page
  console.log('  Step 1: Opening book manage page...');
  browserOpen('https://fanqienovel.com/main/writer/book-manage');
  sleep(5);
  removeTour();

  // Step 2: Find and click "创建新书" button
  console.log('  Step 2: Clicking 创建新书...');
  const writeBtnRef = findRefByText('创建新书');
  if (!writeBtnRef) {
    console.error('  ERROR: Could not find 创建新书 button');
    process.exit(1);
  }
  console.log('    Found ref:', writeBtnRef);
  opencliClick(writeBtnRef);
  sleep(2);

  // Step 3: Click "创建书本" in tooltip
  console.log('  Step 3: Clicking 创建书本...');
  const createBookRef = findRefByText('创建书本');
  if (!createBookRef) {
    console.error('  ERROR: Could not find 创建书本 option');
    process.exit(1);
  }
  console.log('    Found ref:', createBookRef);
  opencliClick(createBookRef);
  sleep(3);

  // Step 4: Fill form
  console.log('  Step 4: Filling form...');

  // 4a. Book title
  const titleRef = findRefByCss('input[placeholder="请输入作品名称"]');
  if (titleRef) {
    opencliFill(titleRef, title);
    console.log('    Title filled');
  }
  sleep(1);

  // 4b. Gender (radio)
  const genderValue = gender === '女频' ? '0' : '1';
  const genderRef = findRefByCss(`input[type=radio][name=pindao][value="${genderValue}"]`);
  if (genderRef) {
    opencliClick(genderRef);
    console.log('    Gender selected:', gender);
  }
  sleep(1);

  // 4c. Genre/tag (modal selection)
  console.log('    Selecting genre:', genre);
  const dropdownRef = findRefByText('请选择作品标签');
  if (dropdownRef) {
    opencliClick(dropdownRef);
    sleep(1);

    const genreRef = findRefByCssWithText('.category-choose-item-title', genre);
    if (genreRef) {
      opencliClick(genreRef);
      console.log('    Genre clicked');
      sleep(1);
    } else {
      console.log('    ⚠️ Genre option not found, skipping');
    }

    // Close modal via React fiber
    console.log('    Closing modal...');
    console.log('    ', closeCategoryModal().trim());
    sleep(1);
  }

  // 4d. Protagonist names
  const p1Ref = findRefByCss('input[placeholder="请输入主角名1"]');
  if (p1Ref) {
    opencliFill(p1Ref, protagonist1);
    console.log('    Protagonist 1 filled');
  }
  sleep(1);

  if (protagonist2) {
    const p2Ref = findRefByCss('input[placeholder="请输入主角名2"]');
    if (p2Ref) {
      opencliFill(p2Ref, protagonist2);
      console.log('    Protagonist 2 filled');
    }
    sleep(1);
  }

  // 4e. Synopsis
  const synRef = findRefByCss('textarea[placeholder*="作品简介"]');
  if (synRef) {
    opencliFill(synRef, synopsis);
    console.log('    Synopsis filled');
  }
  sleep(1);

  // Step 5: Submit
  console.log('  Step 5: Submitting...');
  const submitRef = findRefByText('立即创建');
  if (!submitRef) {
    console.error('  ERROR: Could not find submit button');
    process.exit(1);
  }
  opencliClick(submitRef);
  sleep(3);

  // Step 6: Verify
  console.log('  Step 6: Verifying...');
  const stateOut = run('opencli browser fanqie state');
  const urlMatch = stateOut.match(/URL: (https:\/\/[^\s]+)/);
  const currentUrl = urlMatch ? urlMatch[1] : '';
  const bookIdMatch = currentUrl.match(/book-info\/(\d+)/);
  const bookId = bookIdMatch ? bookIdMatch[1] : '';

  if (bookId) {
    console.log('  ✅ Book created successfully!');
    console.log('  Book ID:', bookId);
    console.log('  Book URL:', currentUrl);
    return { success: true, bookId, url: currentUrl };
  } else {
    console.error('  ⚠️ Book creation may have failed. Current URL:', currentUrl);
    return { success: false, url: currentUrl };
  }
}

// ─── CLI argument parser ────────────────────────────────────────────────────

function parseArgs() {
  const args = {};
  const pos = [];
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = process.argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    } else {
      pos.push(arg);
    }
  }
  return { cmd: pos[0] || 'help', args, pos };
}

// ─── Main dispatcher ────────────────────────────────────────────────────────

const { cmd, args } = parseArgs();
const LIVE_WRITE_COMMANDS = new Set(['upload', 'create-book', 'cleanup']);

function requireLiveConfirmation(command, parsedArgs) {
  if (!LIVE_WRITE_COMMANDS.has(command)) return;
  if (parsedArgs['confirm-live'] === true) return;
  console.error('CONFIRM_REQUIRED');
  console.error(`Command '${command}' writes to Fanqie live state. Re-run with --confirm-live after human approval.`);
  process.exit(2);
}

requireLiveConfirmation(cmd, args);

switch (cmd) {
  case 'upload':
    cmdUpload(args);
    break;
  case 'check-status':
    cmdCheckStatus(args);
    break;
  case 'cleanup':
    cmdCleanup(args);
    break;
  case 'fetch-data':
    cmdFetchData(args);
    break;
  case 'create-book':
    cmdCreateBook(args);
    break;
  case 'help':
  default:
    console.log(`
Fanqie CLI — 番茄小说作家后台自动化工具

Usage:
  node src/adapters/fanqie/fanqie-cli.js <command> [options]

Commands:
  upload        上传并发布章节
                --book-id ID       书籍ID (required)
                --file PATH        章节内容文件 (required)
                --title "TITLE"    章节标题 (required)
                --item-id ID       已有草稿ID (optional, 复用草稿)
                --num N            章节号 (default: 1)
                --volume-id ID     卷ID (optional)

  check-status  检查书籍章节状态
                --book-id ID       书籍ID (required)

  cleanup       清理重复草稿
                --book-id ID       书籍ID (required)
                --keep ID1,ID2     保留的草稿ID
                --delete ID1,ID2   要删除的草稿ID

  fetch-data    抓取作品数据
                --book-id ID       书籍ID (required)

  create-book   创建新书籍
                --title "TITLE"        书名 (required)
                --genre GENRE          分类 (default: 悬疑灵异)
                --synopsis "TEXT"      作品简介 (default: 预设文本)
                --protagonist1 "NAME"  主角名1 (default: 主角)
                --protagonist2 "NAME"  主角名2 (optional)
                --gender 男频|女频     目标读者 (default: 男频)

Examples:
  node src/adapters/fanqie/fanqie-cli.js upload --book-id BOOK_ID --file ch1.txt --title "第1章 标题"
  node src/adapters/fanqie/fanqie-cli.js check-status --book-id BOOK_ID
`);
    break;
}
