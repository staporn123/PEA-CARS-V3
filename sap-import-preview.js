(function () {
  'use strict';

  const TYPES = ['cn43n', 'zpsr048', 'cn52n', 'zpsr055'];
  const TYPE_LABELS = {
    cn43n: 'CN43N',
    zpsr048: 'ZPSR048',
    cn52n: 'CN52N',
    zpsr055: 'ZPSR055'
  };
  let lastSummaryText = '';

  function $(id) {
    return document.getElementById(id);
  }

  function textOf(type) {
    const el = $('text-' + type);
    return el ? el.value || '' : '';
  }

  function setText(type, value) {
    const el = $('text-' + type);
    if (el) el.value = value || '';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function normalizeText(value) {
    return String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }

  function isLikelyWbs(token) {
    const s = String(token || '').trim();
    if (!s) return false;
    if (s.length < 8 || s.length > 45) return false;
    if (!/[A-Z]/i.test(s) || !/[0-9]/.test(s) || s.indexOf('.') === -1 || s.indexOf('-') === -1) return false;
    return /^[A-Z0-9][A-Z0-9._-]*$/i.test(s);
  }

  function findWbsInText(line) {
    const parts = String(line || '').split(/[\s|\t]+/).filter(Boolean);
    for (const p of parts) {
      const cleaned = p.replace(/[,:;()\[\]{}]/g, '').trim();
      if (isLikelyWbs(cleaned)) return cleaned;
    }
    const fallback = String(line || '').match(/[A-Z]-[A-Z0-9._-]*\.[A-Z0-9._-]+/i);
    return fallback ? fallback[0] : '';
  }

  function detectDelimiter(text) {
    const sample = normalizeText(text).split('\n').slice(0, 20).join('\n');
    const tabCount = (sample.match(/\t/g) || []).length;
    const pipeCount = (sample.match(/\|/g) || []).length;
    if (tabCount >= pipeCount && tabCount > 0) return 'tab';
    if (pipeCount > 0) return 'pipe';
    return 'space';
  }

  function splitLine(line, delimiter) {
    if (delimiter === 'tab') return String(line).split('\t').map(x => x.trim());
    if (delimiter === 'pipe') {
      return String(line)
        .split('|')
        .map(x => x.trim())
        .filter((x, i, arr) => x || (i > 0 && i < arr.length - 1));
    }
    return String(line).trim().split(/\s{2,}|\t/).map(x => x.trim()).filter(Boolean);
  }

  function isNoiseLine(line) {
    const s = String(line || '').trim();
    if (!s) return true;
    if (/^-{5,}$/.test(s.replace(/\s/g, ''))) return true;
    if (/^={5,}$/.test(s.replace(/\s/g, ''))) return true;
    if (/^\+[-+]+\+$/.test(s)) return true;
    return false;
  }

  function parseGeneric(text, options) {
    const sourceText = normalizeText(text);
    const delimiter = detectDelimiter(sourceText);
    const lines = sourceText.split('\n');
    const rows = [];
    const uniqueWbs = new Set();
    let lastWbs = '';
    let lastDesc = '';

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      if (isNoiseLine(rawLine)) continue;

      const cells = splitLine(rawLine, delimiter);
      if (!cells.length) continue;

      const joined = cells.join(' ');
      let wbs = findWbsInText(joined);
      let desc = '';

      if (wbs) {
        const wbsCellIndex = cells.findIndex(c => String(c).indexOf(wbs) !== -1 || isLikelyWbs(c));
        desc = wbsCellIndex >= 0 ? (cells[wbsCellIndex + 1] || '') : '';
        lastWbs = wbs;
        if (desc) lastDesc = desc;
      } else if (options && options.fillDownWbs) {
        wbs = lastWbs;
        desc = lastDesc;
      }

      if (wbs) uniqueWbs.add(wbs);

      rows.push({
        rowNo: i + 1,
        raw: rawLine,
        cells,
        wbs,
        desc
      });
    }

    return {
      delimiter,
      totalLines: lines.filter(l => String(l).trim()).length,
      dataRows: rows.length,
      uniqueWbs: Array.from(uniqueWbs),
      rows
    };
  }

  function countBy(values) {
    const map = {};
    values.filter(Boolean).forEach(v => { map[v] = (map[v] || 0) + 1; });
    return map;
  }

  function parseZpsr055(text) {
    const parsed = parseGeneric(text, { fillDownWbs: true });
    const userStatuses = [];
    const systemStatuses = [];
    const knownUser = /^(A0|A1|A2|B1|B2|C1|C2|C3|C4|C5|C6|D1|D2|D9|F1|F2|F3|F4)$/i;
    const knownSystem = /^(AVAC|BUDG|CLSD|CNF|CRTD|ISBD|NTUP|PCNF|REL|SETC|TECO)$/i;

    parsed.rows.forEach(row => {
      row.cells.forEach(cell => {
        const s = String(cell || '').trim().toUpperCase();
        if (knownUser.test(s)) userStatuses.push(s);
        if (knownSystem.test(s)) systemStatuses.push(s);
      });
    });

    parsed.userStatusCounts = countBy(userStatuses);
    parsed.systemStatusCounts = countBy(systemStatuses);
    parsed.userStatusTotal = userStatuses.length;
    parsed.systemStatusTotal = systemStatuses.length;
    return parsed;
  }

  function parseByType(type, text) {
    if (type === 'zpsr055') return parseZpsr055(text);
    return parseGeneric(text, { fillDownWbs: false });
  }

  function delimiterName(delimiter) {
    if (delimiter === 'tab') return 'Tab-separated';
    if (delimiter === 'pipe') return 'Pipe | SAP List';
    return 'Space / Generic';
  }

  function mapPreviewHtml(parsed, type) {
    const sampleRows = parsed.rows.slice(0, 8);
    const wbsSample = parsed.uniqueWbs.slice(0, 8).join('\n') || '-';
    const statusHtml = type === 'zpsr055'
      ? `<div class="kv">
          <span>User Status ที่พบ</span><span>${escapeHtml(Object.keys(parsed.userStatusCounts).join(', ') || '-')}</span>
          <span>System Status ที่พบ</span><span>${escapeHtml(Object.keys(parsed.systemStatusCounts).join(', ') || '-')}</span>
          <span>จำนวน User Status</span><span>${parsed.userStatusTotal}</span>
          <span>จำนวน System Status</span><span>${parsed.systemStatusTotal}</span>
        </div>`
      : '';

    const tableHtml = sampleRows.length ? `
      <table class="sample-table">
        <thead><tr><th>#</th><th>WBS</th><th>ตัวอย่างข้อมูล</th></tr></thead>
        <tbody>${sampleRows.map(r => `
          <tr>
            <td>${r.rowNo}</td>
            <td>${escapeHtml(r.wbs || '-')}</td>
            <td>${escapeHtml(r.cells.slice(0, 7).join(' | '))}</td>
          </tr>`).join('')}</tbody>
      </table>` : '<p class="warn">ยังไม่พบข้อมูลตัวอย่าง</p>';

    return `
      <div class="preview-block">
        <div class="preview-title">${TYPE_LABELS[type]} Preview</div>
        <div class="kv">
          <span>รูปแบบที่ตรวจพบ</span><span>${delimiterName(parsed.delimiter)}</span>
          <span>จำนวนบรรทัดทั้งหมด</span><span>${parsed.totalLines}</span>
          <span>จำนวนแถวข้อมูล</span><span>${parsed.dataRows}</span>
          <span>จำนวน WBS ที่พบ</span><span class="${parsed.uniqueWbs.length ? 'ok' : 'warn'}">${parsed.uniqueWbs.length}</span>
          <span>ตัวอย่าง WBS</span><span>${escapeHtml(wbsSample)}</span>
        </div>
        ${statusHtml}
        ${tableHtml}
      </div>`;
  }

  function summaryText(parsed, type) {
    const lines = [];
    lines.push(`${TYPE_LABELS[type]} Preview`);
    lines.push(`- รูปแบบ: ${delimiterName(parsed.delimiter)}`);
    lines.push(`- จำนวนบรรทัดทั้งหมด: ${parsed.totalLines}`);
    lines.push(`- จำนวนแถวข้อมูล: ${parsed.dataRows}`);
    lines.push(`- จำนวน WBS ที่พบ: ${parsed.uniqueWbs.length}`);
    if (type === 'zpsr055') {
      lines.push(`- User Status: ${Object.keys(parsed.userStatusCounts).join(', ') || '-'}`);
      lines.push(`- System Status: ${Object.keys(parsed.systemStatusCounts).join(', ') || '-'}`);
    }
    return lines.join('\n');
  }

  function setSummaryCard(type, parsed) {
    const el = $('sum-' + type);
    if (!el) return;
    const card = el.closest('.summary-card');
    el.textContent = parsed.uniqueWbs.length || '0';
    const small = card ? card.querySelector('small') : null;
    if (small) small.textContent = `${parsed.dataRows} แถวข้อมูล`;
  }

  function previewOne(type) {
    const text = textOf(type);
    const resultBox = $('resultBox');
    if (!text.trim()) {
      resultBox.className = 'result-box';
      resultBox.innerHTML = `<div class="preview-block"><div class="preview-title">${TYPE_LABELS[type]}</div><p class="warn">ยังไม่มีข้อมูลในช่องนี้</p></div>`;
      lastSummaryText = `${TYPE_LABELS[type]}: ยังไม่มีข้อมูล`;
      return null;
    }
    const parsed = parseByType(type, text);
    setSummaryCard(type, parsed);
    resultBox.className = 'result-box';
    resultBox.innerHTML = mapPreviewHtml(parsed, type);
    lastSummaryText = summaryText(parsed, type);
    return parsed;
  }

  function previewAll() {
    const htmlParts = [];
    const textParts = [];
    TYPES.forEach(type => {
      const text = textOf(type);
      if (!text.trim()) {
        htmlParts.push(`<div class="preview-block"><div class="preview-title">${TYPE_LABELS[type]}</div><p class="warn">ยังไม่มีข้อมูล</p></div>`);
        textParts.push(`${TYPE_LABELS[type]}: ยังไม่มีข้อมูล`);
        return;
      }
      const parsed = parseByType(type, text);
      setSummaryCard(type, parsed);
      htmlParts.push(mapPreviewHtml(parsed, type));
      textParts.push(summaryText(parsed, type));
    });
    const resultBox = $('resultBox');
    resultBox.className = 'result-box';
    resultBox.innerHTML = htmlParts.join('');
    lastSummaryText = textParts.join('\n\n');
  }

  function clearOne(type) {
    setText(type, '');
    const el = $('sum-' + type);
    if (el) {
      el.textContent = '-';
      const small = el.closest('.summary-card')?.querySelector('small');
      if (small) small.textContent = 'ยังไม่ตรวจ';
    }
  }

  function clearAll() {
    TYPES.forEach(clearOne);
    const resultBox = $('resultBox');
    resultBox.className = 'result-box empty';
    resultBox.textContent = 'วางข้อมูลจาก SAP แล้วกด “ตรวจสอบ” เพื่อดู Preview';
    lastSummaryText = '';
  }

  async function copySummary() {
    const text = lastSummaryText || 'ยังไม่มีผล Preview';
    try {
      await navigator.clipboard.writeText(text);
      alert('คัดลอกสรุปแล้ว');
    } catch (err) {
      const tmp = document.createElement('textarea');
      tmp.value = text;
      document.body.appendChild(tmp);
      tmp.select();
      document.execCommand('copy');
      document.body.removeChild(tmp);
      alert('คัดลอกสรุปแล้ว');
    }
  }

  function bindEvents() {
    document.querySelectorAll('[data-preview]').forEach(btn => {
      btn.addEventListener('click', () => previewOne(btn.getAttribute('data-preview')));
    });
    document.querySelectorAll('[data-clear]').forEach(btn => {
      btn.addEventListener('click', () => clearOne(btn.getAttribute('data-clear')));
    });
    $('btnPreviewAll')?.addEventListener('click', previewAll);
    $('btnClearAll')?.addEventListener('click', clearAll);
    $('btnCopySummary')?.addEventListener('click', copySummary);
  }

  window.PeaSapClipboardPreview = {
    previewOne,
    previewAll,
    clearAll,
    parseGeneric,
    parseZpsr055
  };

  document.addEventListener('DOMContentLoaded', bindEvents);
})();
