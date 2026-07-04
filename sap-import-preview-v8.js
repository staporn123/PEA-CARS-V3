(function () {
  'use strict';

  const LAB_VERSION = 'V8';

  const TYPES = ['cn43n', 'zpsr048', 'cn52n', 'zpsr055'];
  const TYPE_LABELS = {
    cn43n: 'CN43N',
    zpsr048: 'ZPSR048',
    cn52n: 'CN52N',
    zpsr055: 'ZPSR055'
  };

  const KNOWN_USER_STATUS = new Set(['A0','A1','A2','A5','B1','B2','Z0','C1','C2','C3','C4','C5','C6','D1','D2','D9','E1','E2','F1','F2','F3','F4']);
  const KNOWN_SYSTEM_STATUS = new Set(['AVAC','BUDG','CLSD','CNF','CRTD','ISBD','NTUP','PCNF','REL','SETC','TECO','MSPT','PRC','SSAP','CNM','ACAS','MANC']);
  const ACTIVE_SYSTEM_STATUS = new Set(['REL','TECO','CLSD']);
  // V8 Rule: นับเฉพาะ WBS ปลายทาง/Leaf + Level > 2 + ผู้รับผิดชอบไม่ว่าง + User Status ตั้งแต่ C1 ขึ้นไป + SAP Status มี REL/TECO/CLSD
  const ELIGIBLE_USER_STATUS = new Set(['C1','C2','C3','C4','C5','C6','D1','D2','D9','E1','E2','F1','F2','F3','F4']);
  const INELIGIBLE_USER_STATUS = new Set(['A0','A1','A2','A5','B1','B2','Z0']);

  let lastSummaryText = '';
  let lastCompareText = '';
  let parsedCache = {};

  function $(id) { return document.getElementById(id); }
  function textOf(type) { const el = $('text-' + type); return el ? el.value || '' : ''; }
  function setText(type, value) { const el = $('text-' + type); if (el) el.value = value || ''; }

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

  function normalizeWbs(value) {
    return String(value || '').trim().toUpperCase().replace(/[–—−]/g, '-').replace(/[^A-Z0-9._-]/g, '');
  }

  function isLikelyWbs(token) {
    const s = normalizeWbs(token);
    if (!s) return false;
    if (s.length < 8 || s.length > 60) return false;
    if (!/[A-Z]/.test(s) || !/[0-9]/.test(s) || s.indexOf('.') === -1 || s.indexOf('-') === -1) return false;
    if (/^(AVAC|BUDG|CLSD|CNF|CRTD|ISBD|NTUP|PCNF|REL|SETC|TECO)$/.test(s)) return false;
    return /^[A-Z0-9][A-Z0-9._-]*$/.test(s);
  }

  function extractWbsList(line) {
    const src = String(line || '').toUpperCase().replace(/[–—−]/g, '-');
    const tokens = src.split(/[\s|\t]+/).map(x => x.replace(/[,:;()\[\]{}<>]/g, '').trim()).filter(Boolean);
    const out = [];
    tokens.forEach(t => { if (isLikelyWbs(t)) out.push(normalizeWbs(t)); });
    if (!out.length) {
      const matches = src.match(/[A-Z]-[A-Z0-9._-]*\.[A-Z0-9._-]*\d[A-Z0-9._-]*/g) || [];
      matches.forEach(m => { if (isLikelyWbs(m)) out.push(normalizeWbs(m)); });
    }
    return Array.from(new Set(out));
  }

  function findWbsInText(line) {
    const found = extractWbsList(line);
    return found[0] || '';
  }

  function wbsLevel(wbs, levelValue) {
    const s = normalizeWbs(wbs);
    const level = Number(String(levelValue == null ? '' : levelValue).replace(/[^0-9]/g, ''));

    // V8: สำหรับ CN43N ให้ใช้คอลัมน์ระดับเป็นหลัก เพราะ WBS บางชุด เช่น P-NHE03.1-D-AANCS.0029
    // เป็นงานจริงแม้รูปแบบจุดไม่เหมือน C-68-D-AANCS.0001.01.1
    if (level >= 3) return 'WORK';
    if (level > 0 && level <= 2) return 'PARENT';

    const dotCount = (s.match(/\./g) || []).length;
    const isWork = /\.\d{4}\.\d{2}\.\d+$/i.test(s) || dotCount >= 3;
    return isWork ? 'WORK' : 'PARENT';
  }

  function extractSystemStatusTokens(value) {
    const src = String(value || '').toUpperCase();
    const tokens = src.split(/[^A-Z0-9]+/).filter(Boolean);
    return Array.from(new Set(tokens.filter(t => KNOWN_SYSTEM_STATUS.has(t))));
  }

  function hasActiveSystemStatus(value) {
    return extractSystemStatusTokens(value).some(t => ACTIVE_SYSTEM_STATUS.has(t));
  }

  function extractUserStatusTokens(value) {
    const src = String(value || '').toUpperCase();
    const tokens = src.split(/[^A-Z0-9]+/).filter(Boolean);
    return Array.from(new Set(tokens.filter(t => KNOWN_USER_STATUS.has(t))));
  }

  function hasEligibleUserStatus(value) {
    return extractUserStatusTokens(value).some(t => ELIGIBLE_USER_STATUS.has(t));
  }

  function userStatusLabel(tokens) {
    const arr = Array.from(new Set(tokens || [])).filter(Boolean);
    return arr.length ? arr.join(', ') : '';
  }

  function numericLevel(value) {
    const n = Number(String(value == null ? '' : value).replace(/[^0-9]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }

  function applyCn43nLeafRule(rows) {
    // V8: CN43N ใช้กฎเดียวกับการ Filter ใน SAP ที่ผู้ใช้ทำจริง
    // 1) ตัด Level 1-2 / Node / WBS แม่ออก
    // 2) ต้องมีผู้รับผิดชอบ/ผู้สมัคร ไม่ว่าง
    // 3) ต้องมี User Status ตั้งแต่ C1 ขึ้นไป
    // 4) ต้องมี SAP Status เป็น REL/TECO/CLSD อย่างน้อยหนึ่งค่า เพื่อไม่ดึง CRTD-only แม้มี C1
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowLevel = numericLevel(row.level);
      const rowWbs = normalizeWbs(row.wbs);

      let nextLevel = 0;
      for (let j = i + 1; j < rows.length; j++) {
        if (!rows[j] || !rows[j].wbs) continue;
        nextLevel = numericLevel(rows[j].level);
        if (nextLevel > 0) break;
      }

      const hasChildByNextLevel = rowLevel > 0 && nextLevel > rowLevel;
      const hasChildByPrefix = !!rowWbs && rows.some(function(other, idx) {
        if (idx === i || !other || !other.wbs) return false;
        const ow = normalizeWbs(other.wbs);
        return ow !== rowWbs && ow.indexOf(rowWbs + '.') === 0;
      });

      const isLevelParent = rowLevel > 0 && rowLevel <= 2;
      const isParent = isLevelParent || hasChildByNextLevel || hasChildByPrefix;
      const isEligibleUser = (row.userStatusTokens || []).some(function(t) { return ELIGIBLE_USER_STATUS.has(t); });
      const isActiveSap = hasActiveSystemStatus(row.status);
      const hasOwner = String(row.owner || '').trim() !== '';
      const levelOk = rowLevel > 2;

      row.wbsType = isParent ? 'PARENT' : 'WORK';
      row.isLeaf = isParent ? 'NO' : 'YES';
      row.activeBySap = isActiveSap ? 'YES' : 'NO';
      row.ownerFlag = hasOwner ? 'YES' : 'NO';
      row.userEligibleFlag = isEligibleUser ? 'YES' : 'NO';
      row.levelOkFlag = levelOk ? 'YES' : 'NO';
      row.counted = (!isParent && levelOk && hasOwner && isEligibleUser && isActiveSap) ? 'YES' : 'NO';
      row.excludeReason = row.counted === 'YES' ? '' : (
        isLevelParent ? 'Level 1-2 / WBS แม่' :
        hasChildByNextLevel ? 'มี WBS ลูกในลำดับถัดไป' :
        hasChildByPrefix ? 'มี WBS ลูกต่อท้าย / Node หลัก' :
        !levelOk ? 'Level ไม่มากกว่า 2' :
        !hasOwner ? 'ผู้รับผิดชอบว่าง' :
        !isEligibleUser ? 'User Status ยังไม่ถึง C1' :
        !isActiveSap ? 'SAP ยังไม่มี REL/TECO/CLSD' : 'ไม่เข้าเงื่อนไข'
      );
    }
  }

  function eligibleWbsList(parsed) {
    if (!parsed) return [];

    // CN43N V8: ฐานหลัก = แถวที่ counted = YES เท่านั้น
    // คือ Leaf + Level > 2 + ผู้รับผิดชอบไม่ว่าง + C1 ขึ้นไป + REL/TECO/CLSD
    if (parsed.type === 'cn43n') {
      return (parsed.countedWbsList && parsed.countedWbsList.length)
        ? parsed.countedWbsList
        : [];
    }

    // ZPSR048/ZPSR055: ถ้ามี User Status ในรายงาน ให้ใช้ C1 ขึ้นไปเป็นหลัก
    if ((parsed.type === 'zpsr048' || parsed.type === 'zpsr055') && parsed.userEligibleWbsList && parsed.userEligibleWbsList.length) {
      return parsed.userEligibleWbsList;
    }

    // fallback สำหรับรายงานที่ไม่มี User Status ชัดเจน แต่มี SAP REL/TECO/CLSD
    if ((parsed.type === 'zpsr048' || parsed.type === 'zpsr055') && parsed.activeWbsList && parsed.activeWbsList.length) {
      return parsed.activeWbsList;
    }

    // CN52N โดยมากไม่มี Status ในแต่ละบรรทัด จึงใช้ WBS ที่พบในข้อมูลพัสดุ
    if (parsed.type === 'cn52n') {
      return parsed.uniqueWbs || [];
    }

    return (parsed.userEligibleWbsList && parsed.userEligibleWbsList.length) ? parsed.userEligibleWbsList : (parsed.uniqueWbs || []);
  }

  function primaryWbsCount(parsed) {
    return eligibleWbsList(parsed).length;
  }

  function primaryWbsLabel(parsed) {
    if (!parsed) return 'ยังไม่ตรวจ';
    if (parsed.type === 'cn52n') {
      return `${parsed.uniqueWbs.length} WBS พัสดุ / ${parsed.workWbs} งานจริง / ${parsed.parentWbs} แม่`;
    }
    const userEligible = parsed.userEligibleWbsList ? parsed.userEligibleWbsList.length : 0;
    const userWork = parsed.userEligibleWorkWbsList ? parsed.userEligibleWorkWbsList.length : 0;
    const userExcluded = parsed.userStatusExcludedWbsList ? parsed.userStatusExcludedWbsList.length : 0;
    const levelExcluded = parsed.levelExcludedWbsList ? parsed.levelExcludedWbsList.length : 0;
    if (parsed.type === 'cn43n') return `${primaryWbsCount(parsed)} ใช้เทียบ / เจ้าของว่าง ${parsed.ownerExcludedWbs || 0} / Node ${parsed.leafExcludedWbs || 0}`;
    return `${primaryWbsCount(parsed)} ใช้เทียบ / C1+ ${userEligible} / งานจริง+C1 ${userWork}`;
  }

  function detectDelimiter(text) {
    const sample = normalizeText(text).split('\n').slice(0, 40).join('\n');
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
        .filter(x => x !== '');
    }
    return String(line).trim().split(/\s{2,}|\t/).map(x => x.trim()).filter(Boolean);
  }

  function isNoiseLine(line) {
    const s = String(line || '').trim();
    if (!s) return true;
    const compact = s.replace(/\s/g, '');
    if (/^-{5,}$/.test(compact)) return true;
    if (/^={5,}$/.test(compact)) return true;
    if (/^[+\-|]{5,}$/.test(compact)) return true;
    return false;
  }

  function toNumber(value) {
    const s = String(value == null ? '' : value).replace(/,/g, '').trim();
    if (!s || !/^[-+]?\d+(\.\d+)?$/.test(s)) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function extractNumbers(line) {
    const matches = String(line || '').match(/[-+]?\d{1,3}(?:,\d{3})*(?:\.\d+)?|[-+]?\d+\.\d+|[-+]?\d+/g) || [];
    return matches
      .map(toNumber)
      .filter(n => n !== null);
  }

  function countMap(values) {
    const map = {};
    values.filter(Boolean).forEach(v => { map[v] = (map[v] || 0) + 1; });
    return map;
  }

  function topCounts(map, limit) {
    return Object.entries(map).sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit || 10);
  }

  function baseResult(type, text) {
    const sourceText = normalizeText(text);
    const lines = sourceText.split('\n');
    return {
      type,
      label: TYPE_LABELS[type],
      delimiter: detectDelimiter(sourceText),
      totalLines: lines.filter(l => String(l).trim()).length,
      dataRows: 0,
      rows: [],
      uniqueWbs: [],
      wbsCounts: {},
      parentWbs: 0,
      workWbs: 0,
      notes: []
    };
  }

  function finalizeResult(result) {
    result.dataRows = result.rows.length;
    const allWbs = result.rows.map(r => r.wbs).filter(Boolean);
    result.wbsCounts = countMap(allWbs);
    result.uniqueWbs = Object.keys(result.wbsCounts).sort();

    const meta = {};
    result.rows.forEach(r => {
      if (!r.wbs) return;
      if (!meta[r.wbs]) {
        meta[r.wbs] = {
          wbs: r.wbs,
          types: new Set(),
          statuses: new Set(),
          hasStatus: false,
          hasActive: false,
          userStatuses: new Set(),
          hasUserStatus: false,
          hasEligibleUser: false,
          sampleStatus: '',
          sampleUserStatus: '',
          sampleRaw: ''
        };
      }
      const m = meta[r.wbs];
      m.types.add(r.wbsType || wbsLevel(r.wbs, r.level));
      (r.statusTokens || extractSystemStatusTokens(r.status || r.systemStatus || r.raw)).forEach(st => {
        m.statuses.add(st);
        m.hasStatus = true;
        if (ACTIVE_SYSTEM_STATUS.has(st)) m.hasActive = true;
      });
      (r.userStatusTokens || extractUserStatusTokens(r.userStatus || r.status || r.raw)).forEach(us => {
        m.userStatuses.add(us);
        m.hasUserStatus = true;
        if (ELIGIBLE_USER_STATUS.has(us)) m.hasEligibleUser = true;
      });
      if (!m.sampleStatus && (r.status || r.systemStatus)) m.sampleStatus = r.status || r.systemStatus;
      if (!m.sampleUserStatus && (r.userStatus || (r.userStatusTokens && r.userStatusTokens.length))) m.sampleUserStatus = r.userStatus || userStatusLabel(r.userStatusTokens);
      if (!m.sampleRaw && r.raw) m.sampleRaw = r.raw;
    });

    result.wbsMeta = meta;
    result.workWbsList = [];
    result.parentWbsList = [];
    result.activeWbsList = [];
    result.activeWorkWbsList = [];
    result.inactiveExcludedWbsList = [];
    result.unknownStatusWorkWbsList = [];
    result.userEligibleWbsList = [];
    result.userEligibleWorkWbsList = [];
    result.userStatusExcludedWbsList = [];
    result.levelExcludedWbsList = [];
    result.countedWbsList = [];
    result.ownerExcludedWbsList = [];
    result.leafExcludedWbsList = [];
    result.sapExcludedWbsList = [];

    result.uniqueWbs.forEach(w => {
      const m = meta[w] || { types: new Set([wbsLevel(w)]), hasStatus: false, hasActive: false, hasUserStatus: false, hasEligibleUser: false };
      const isWork = m.types.has('WORK');
      if (isWork) result.workWbsList.push(w);
      else {
        result.parentWbsList.push(w);
        result.levelExcludedWbsList.push(w);
      }

      if (m.hasActive) result.activeWbsList.push(w);
      if (isWork && m.hasActive) result.activeWorkWbsList.push(w);
      if (isWork && m.hasStatus && !m.hasActive) result.inactiveExcludedWbsList.push(w);
      if (isWork && !m.hasStatus) result.unknownStatusWorkWbsList.push(w);
      if (m.hasEligibleUser) result.userEligibleWbsList.push(w);
      if (isWork && m.hasEligibleUser) result.userEligibleWorkWbsList.push(w);
      if (isWork && m.hasUserStatus && !m.hasEligibleUser) result.userStatusExcludedWbsList.push(w);

      const relatedRows = result.rows.filter(r => normalizeWbs(r.wbs) === w);
      if (relatedRows.some(r => r.counted === 'YES')) result.countedWbsList.push(w);
      if (relatedRows.some(r => r.excludeReason === 'ผู้รับผิดชอบว่าง')) result.ownerExcludedWbsList.push(w);
      if (relatedRows.some(r => String(r.excludeReason || '').indexOf('ลูก') >= 0 || String(r.excludeReason || '').indexOf('Node') >= 0)) result.leafExcludedWbsList.push(w);
      if (relatedRows.some(r => r.excludeReason === 'SAP ยังไม่มี REL/TECO/CLSD')) result.sapExcludedWbsList.push(w);
    });

    result.parentWbs = result.parentWbsList.length;
    result.workWbs = result.workWbsList.length;
    result.activeWbs = result.activeWbsList.length;
    result.activeWorkWbs = result.activeWorkWbsList.length;
    result.inactiveExcludedWbs = result.inactiveExcludedWbsList.length;
    result.unknownStatusWorkWbs = result.unknownStatusWorkWbsList.length;
    result.userEligibleWbs = result.userEligibleWbsList.length;
    result.userEligibleWorkWbs = result.userEligibleWorkWbsList.length;
    result.userStatusExcludedWbs = result.userStatusExcludedWbsList.length;
    result.levelExcludedWbs = result.levelExcludedWbsList.length;
    result.countedWbs = result.countedWbsList.length;
    result.ownerExcludedWbs = result.ownerExcludedWbsList.length;
    result.leafExcludedWbs = result.leafExcludedWbsList.length;
    result.sapExcludedWbs = result.sapExcludedWbsList.length;
    result.duplicateWbs = topCounts(result.wbsCounts, 20).filter(x => x[1] > 1);
    return result;
  }

  function parseCn43n(text) {
    const result = baseResult('cn43n', text);
    const delimiter = result.delimiter;
    const lines = normalizeText(text).split('\n');

    lines.forEach((line, index) => {
      if (isNoiseLine(line)) return;
      const cells = splitLine(line, delimiter);
      if (!cells.length) return;

      // CN43N ต้องนับจากคอลัมน์แรก "องค์ประกอบ WBS" เป็นหลัก
      // ห้าม scan ทั้งบรรทัดแบบกว้างเกินไป เพราะ SAP List มี WBS แม่/ลูก/ข้อความอื่นปน ทำให้นับเกินจริง
      let wbs = '';
      const firstWbsCell = cells.find(c => isLikelyWbs(c));
      if (firstWbsCell) wbs = normalizeWbs(firstWbsCell);
      if (!wbs) return;

      const wi = cells.findIndex(c => normalizeWbs(c) === wbs || String(c).indexOf(wbs) >= 0);
      const projectDef = cells[wi + 1] || cells[1] || '';
      const level = cells[wi + 2] || cells[2] || '';
      const jobName = cells[wi + 3] || cells[3] || '';
      const statusCell = cells.find(c => /\b(REL|TECO|CLSD|AVAC|BUDG|CNF|CRTD|ISBD|NTUP|SETC|PREL)\b/i.test(c)) || '';
      const statusTokens = extractSystemStatusTokens(statusCell || line);
      const userStatusTokens = extractUserStatusTokens(statusCell || line);
      const eligibleByUser = userStatusTokens.some(t => ELIGIBLE_USER_STATUS.has(t));
      const ownerCell = cells.find(c => /^นาย|^นาง|^น\.ส\.|^นางสาว/.test(c)) || '';
      const dates = (line.match(/\b\d{1,2}[./]\d{1,2}[./]\d{4}\b/g) || []);

      // ถ้า SAP list wrap บรรทัด ทำให้บรรทัดไม่มี level/jobName ชัดเจน ให้ยังเก็บไว้แต่ระบุ raw
      result.rows.push({
        rowNo: index + 1,
        wbs,
        wbsType: wbsLevel(wbs, level),
        projectDef,
        level,
        jobName,
        status: statusCell,
        statusTokens,
        userStatusTokens,
        userStatus: userStatusLabel(userStatusTokens),
        activeBySap: hasActiveSystemStatus(statusCell || line) ? 'YES' : 'NO',
        owner: ownerCell,
        startDate: dates[0] || '',
        raw: line,
        cells
      });
    });

    applyCn43nLeafRule(result.rows);
    result.notes.push('CN43N V8: นับเฉพาะ Leaf WBS + Level > 2 + ผู้รับผิดชอบไม่ว่าง + User Status ตั้งแต่ C1 ขึ้นไป + SAP มี REL/TECO/CLSD');
    return finalizeResult(result);
  }

  function parseZpsr048(text) {
    const result = baseResult('zpsr048', text);
    const delimiter = result.delimiter;
    const lines = normalizeText(text).split('\n');

    lines.forEach((line, index) => {
      if (isNoiseLine(line)) return;
      const wbs = findWbsInText(line);
      if (!wbs) return;
      const cells = splitLine(line, delimiter);
      const nums = extractNumbers(line);
      const statusCell = cells.find(c => /\b(REL|TECO|CLSD|AVAC|BUDG|CNF|CRTD|ISBD|NTUP|SETC|MSPT|PRC|SSAP)\b/i.test(c)) || '';
      const statusTokens = extractSystemStatusTokens(statusCell || line);
      const descCandidate = cells.find(c => c && c !== wbs && /[ก-๙A-Z]/i.test(c) && !/\b(REL|TECO|CLSD|AVAC|BUDG|CNF|CRTD|ISBD|NTUP|SETC|MSPT|PRC|SSAP)\b/i.test(c) && !isLikelyWbs(c)) || '';
      result.rows.push({
        rowNo: index + 1,
        wbs,
        wbsType: wbsLevel(wbs),
        jobName: descCandidate,
        status: statusCell,
        statusTokens,
        userStatusTokens,
        userStatus: userStatusLabel(userStatusTokens),
        activeBySap: eligibleByUser ? 'YES' : (statusTokens.some(t => ACTIVE_SYSTEM_STATUS.has(t)) ? 'SAP' : 'NO'),
        numberCount: nums.length,
        totalNumber: nums.reduce((a,b) => a + b, 0),
        lastNumber: nums.length ? nums[nums.length - 1] : null,
        raw: line,
        cells,
        numbers: nums
      });
    });

    result.notes.push('ZPSR048 V8: ใช้ User Status ตั้งแต่ C1 ขึ้นไปเป็นเกณฑ์หลัก หากพบสถานะผู้ใช้ในรายงาน');
    return finalizeResult(result);
  }

  function parseCn52n(text) {
    const result = baseResult('cn52n', text);
    const delimiter = result.delimiter;
    const lines = normalizeText(text).split('\n');
    const materialCodeRe = /^(?:\d+-\d{2}-\d{3}-\d{4}|[A-Z0-9]{1,4}-[A-Z0-9-]{3,}|\d{1,2}-\d{2}-\d{3}-\d{4})$/i;

    lines.forEach((line, index) => {
      if (isNoiseLine(line)) return;
      const wbs = findWbsInText(line);
      if (!wbs) return;
      const cells = splitLine(line, delimiter);
      const wi = cells.findIndex(c => normalizeWbs(c) === wbs || c.indexOf(wbs) >= 0 || isLikelyWbs(c));
      let network = '';
      let materialCode = '';
      let materialName = '';
      let plant = '';
      let storage = '';

      for (let i = 0; i < cells.length; i++) {
        const c = cells[i];
        if (!network && /^\d{6,12}$/.test(c)) network = c;
        if (!materialCode && materialCodeRe.test(c)) {
          materialCode = c;
          materialName = cells[i + 1] || '';
        }
      }
      const afterMaterial = materialCode ? cells.slice(cells.indexOf(materialCode) + 2) : cells.slice(wi + 1);
      plant = afterMaterial.find(c => /^\d{3,4}$/.test(c)) || '';
      storage = afterMaterial.find(c => /^[A-Z]\d{3,4}$/i.test(c)) || '';
      const nums = extractNumbers(line);
      const statusTokens = extractSystemStatusTokens(line);
      const userStatusTokens = extractUserStatusTokens(line);

      result.rows.push({
        rowNo: index + 1,
        wbs,
        wbsType: wbsLevel(wbs),
        network,
        materialCode,
        materialName,
        plant,
        storage,
        statusTokens,
        userStatusTokens,
        userStatus: userStatusLabel(userStatusTokens),
        activeBySap: userStatusTokens.some(t => ELIGIBLE_USER_STATUS.has(t)) ? 'YES' : '',
        numberCount: nums.length,
        raw: line,
        cells,
        numbers: nums
      });
    });

    return finalizeResult(result);
  }

  function parseZpsr055(text) {
    const result = baseResult('zpsr055', text);
    const delimiter = result.delimiter;
    const lines = normalizeText(text).split('\n');
    let currentWbs = '';
    let currentName = '';
    const userStatuses = [];
    const systemStatuses = [];
    const perWbs = {};

    lines.forEach((line, index) => {
      if (isNoiseLine(line)) return;
      const cells = splitLine(line, delimiter);
      if (!cells.length) return;
      const foundWbs = findWbsInText(line);
      if (foundWbs) {
        currentWbs = foundWbs;
        const wi = cells.findIndex(c => normalizeWbs(c) === foundWbs || c.indexOf(foundWbs) >= 0 || isLikelyWbs(c));
        const maybeName = wi >= 0 ? (cells[wi + 1] || cells[wi + 2] || '') : '';
        if (maybeName && !KNOWN_USER_STATUS.has(maybeName.toUpperCase()) && !KNOWN_SYSTEM_STATUS.has(maybeName.toUpperCase())) currentName = maybeName;
      }

      const rowUserStatuses = [];
      const rowSystemStatuses = [];
      cells.forEach(c => {
        const s = String(c || '').trim().toUpperCase();
        if (KNOWN_USER_STATUS.has(s)) rowUserStatuses.push(s);
        if (KNOWN_SYSTEM_STATUS.has(s)) rowSystemStatuses.push(s);
      });

      if (!currentWbs && !foundWbs) return;
      if (!rowUserStatuses.length && !rowSystemStatuses.length && !foundWbs) return;

      rowUserStatuses.forEach(s => userStatuses.push(s));
      rowSystemStatuses.forEach(s => systemStatuses.push(s));
      const dates = (line.match(/\b\d{1,2}[./]\d{1,2}[./]\d{4}\b/g) || []);
      const times = (line.match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g) || []);

      const statusTokens = rowSystemStatuses.slice();

      const record = {
        rowNo: index + 1,
        wbs: currentWbs,
        wbsType: wbsLevel(currentWbs),
        jobName: currentName,
        userStatus: rowUserStatuses.join(', '),
        userStatusTokens: rowUserStatuses.slice(),
        systemStatus: rowSystemStatuses.join(', '),
        statusTokens,
        activeBySap: rowUserStatuses.some(t => ELIGIBLE_USER_STATUS.has(t)) ? 'YES' : (statusTokens.some(t => ACTIVE_SYSTEM_STATUS.has(t)) ? 'SAP' : 'NO'),
        date: dates[0] || '',
        time: times[0] || '',
        raw: line,
        cells
      };
      result.rows.push(record);
      if (!perWbs[currentWbs]) perWbs[currentWbs] = { user: [], system: [] };
      rowUserStatuses.forEach(s => perWbs[currentWbs].user.push(s));
      rowSystemStatuses.forEach(s => perWbs[currentWbs].system.push(s));
    });

    result.userStatusCounts = countMap(userStatuses);
    result.systemStatusCounts = countMap(systemStatuses);
    result.userStatusTotal = userStatuses.length;
    result.systemStatusTotal = systemStatuses.length;
    result.perWbs = perWbs;
    return finalizeResult(result);
  }

  function parseByType(type, text) {
    if (type === 'cn43n') return parseCn43n(text);
    if (type === 'zpsr048') return parseZpsr048(text);
    if (type === 'cn52n') return parseCn52n(text);
    if (type === 'zpsr055') return parseZpsr055(text);
    return finalizeResult(baseResult(type, text));
  }

  function delimiterName(delimiter) {
    if (delimiter === 'tab') return 'Tab-separated';
    if (delimiter === 'pipe') return 'Pipe | SAP List';
    return 'Space / Generic';
  }

  function getPreviewColumns(type) {
    if (type === 'cn43n') return [
      ['rowNo','#'], ['wbs','WBS'], ['wbsType','ประเภท'], ['isLeaf','ปลายทาง'], ['level','Level'], ['ownerFlag','มีผู้รับผิดชอบ'], ['userEligibleFlag','C1 ขึ้นไป'], ['activeBySap','REL/TECO/CLSD'], ['counted','นับ'], ['excludeReason','เหตุผลตัด'], ['jobName','ชื่องาน'], ['status','สถานะ'], ['owner','ผู้รับผิดชอบ']
    ];
    if (type === 'zpsr048') return [
      ['rowNo','#'], ['wbs','WBS'], ['wbsType','ประเภท'], ['activeBySap','C1 ขึ้นไป'], ['status','สถานะ'], ['numberCount','จำนวนตัวเลข'], ['lastNumber','ตัวเลขท้ายบรรทัด'], ['jobName','ข้อความที่จับได้']
    ];
    if (type === 'cn52n') return [
      ['rowNo','#'], ['wbs','WBS'], ['wbsType','ประเภท'], ['network','Network'], ['materialCode','รหัสพัสดุ'], ['materialName','รายการพัสดุ'], ['plant','Plant'], ['storage','Storage']
    ];
    if (type === 'zpsr055') return [
      ['rowNo','#'], ['wbs','WBS'], ['wbsType','ประเภท'], ['activeBySap','C1 ขึ้นไป'], ['jobName','ชื่องาน'], ['userStatus','User Status'], ['systemStatus','System Status'], ['date','วันที่'], ['time','เวลา']
    ];
    return [['rowNo','#'], ['wbs','WBS'], ['raw','Raw']];
  }

  function renderTable(rows, cols, limit) {
    const sample = rows.slice(0, limit || 12);
    if (!sample.length) return '<p class="warn">ยังไม่พบข้อมูลตัวอย่าง</p>';
    return `<div class="table-wrap"><table class="sample-table"><thead><tr>${cols.map(c => `<th>${escapeHtml(c[1])}</th>`).join('')}</tr></thead><tbody>${sample.map(r => `<tr>${cols.map(c => `<td>${escapeHtml(r[c[0]] == null ? '' : r[c[0]])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  function renderPills(map, cls) {
    const keys = Object.keys(map || {}).sort();
    if (!keys.length) return '-';
    return keys.map(k => `<span class="pill ${cls || ''}">${escapeHtml(k)}: ${map[k]}</span>`).join('');
  }

  function previewHtml(parsed, type) {
    const wbsSample = parsed.uniqueWbs.slice(0, 10).join('\n') || '-';
    const extra = type === 'zpsr055'
      ? `<div class="kv">
          <span>User Status ที่พบ</span><span>${renderPills(parsed.userStatusCounts, 'ok')}</span>
          <span>System Status ที่พบ</span><span>${renderPills(parsed.systemStatusCounts, 'warn')}</span>
          <span>จำนวน User Status</span><span>${parsed.userStatusTotal || 0}</span>
          <span>จำนวน System Status</span><span>${parsed.systemStatusTotal || 0}</span>
        </div>`
      : '';
    const duplicateText = parsed.duplicateWbs && parsed.duplicateWbs.length
      ? parsed.duplicateWbs.slice(0, 8).map(x => `${x[0]} (${x[1]})`).join('\n')
      : '-';
    const excludedText = parsed.inactiveExcludedWbsList && parsed.inactiveExcludedWbsList.length
      ? parsed.inactiveExcludedWbsList.slice(0, 12).map(w => {
          const meta = parsed.wbsMeta && parsed.wbsMeta[w];
          const status = meta ? Array.from(meta.statuses || []).join(' ') : '';
          return `${w}${status ? ' | ' + status : ''}`;
        }).join('\n')
      : '-';
    const notes = parsed.notes && parsed.notes.length ? `<p class="note">${escapeHtml(parsed.notes.join(' / '))}</p>` : '';

    return `
      <div class="preview-block">
        <div class="preview-title">${TYPE_LABELS[type]} Preview V8</div>
        <div class="kv">
          <span>รูปแบบที่ตรวจพบ</span><span>${delimiterName(parsed.delimiter)}</span>
          <span>จำนวนบรรทัดทั้งหมด</span><span>${parsed.totalLines}</span>
          <span>จำนวนแถวข้อมูลจริง</span><span>${parsed.dataRows}</span>
          <span>จำนวนหลักที่ใช้เทียบ</span><span class="${primaryWbsCount(parsed) ? 'ok' : 'warn'}">${primaryWbsCount(parsed)}</span>
          <span>WBS ที่มี REL/TECO/CLSD</span><span class="ok">${parsed.activeWbs || 0}</span>
          <span>WBS ที่มี User Status C1 ขึ้นไป</span><span class="ok">${parsed.userEligibleWbs || 0}</span>
          <span>WBS ปลายทาง + C1 ขึ้นไป</span><span class="ok">${parsed.userEligibleWorkWbs || 0}</span>
          <span>CN43N V8 นับจริง</span><span class="ok">${parsed.countedWbs || primaryWbsCount(parsed)}</span>
          <span>WBS ถูกตัด: Level 1-2</span><span class="warn">${parsed.levelExcludedWbs || 0}</span>
          <span>WBS ถูกตัด: Node/มีลูก</span><span class="warn">${parsed.leafExcludedWbs || 0}</span>
          <span>WBS ถูกตัด: ผู้รับผิดชอบว่าง</span><span class="warn">${parsed.ownerExcludedWbs || 0}</span>
          <span>WBS ถูกตัด: ยังไม่ถึง C1</span><span class="${parsed.userStatusExcludedWbs ? 'bad' : 'ok'}">${parsed.userStatusExcludedWbs || 0}</span>
          <span>WBS ถูกตัด: ยังไม่มี REL/TECO/CLSD</span><span class="${parsed.sapExcludedWbs ? 'bad' : 'ok'}">${parsed.sapExcludedWbs || 0}</span>
          <span>WBS ไม่ซ้ำทั้งหมด</span><span>${parsed.uniqueWbs.length}</span>
          <span>WBS งานจริง</span><span>${parsed.workWbs}</span>
          <span>WBS แม่/หัวโครงการ</span><span>${parsed.parentWbs}</span>
          <span>WBS ซ้ำในรายงาน</span><span>${parsed.duplicateWbs.length ? parsed.duplicateWbs.length + ' รายการ' : '-'}</span>
          <span>ตัวอย่าง WBS ที่ใช้เทียบ</span><span><pre>${escapeHtml(renderList(eligibleWbsList(parsed), 12))}</pre></span>
          <span>ตัวอย่าง WBS ถูกตัดออก</span><span><pre>${escapeHtml(excludedText)}</pre></span>
          <span>ตัวอย่าง WBS ซ้ำ</span><span><pre>${escapeHtml(duplicateText)}</pre></span>
        </div>
        ${extra}
        ${notes}
        ${renderTable(parsed.rows, getPreviewColumns(type), 12)}
      </div>`;
  }

  function summaryText(parsed, type) {
    const lines = [];
    lines.push(`${TYPE_LABELS[type]} Preview V8`);
    lines.push(`- รูปแบบ: ${delimiterName(parsed.delimiter)}`);
    lines.push(`- จำนวนบรรทัดทั้งหมด: ${parsed.totalLines}`);
    lines.push(`- จำนวนแถวข้อมูลจริง: ${parsed.dataRows}`);
    lines.push(`- จำนวนหลักที่ใช้เทียบ: ${primaryWbsCount(parsed)}`);
    lines.push(`- WBS ที่มี REL/TECO/CLSD: ${parsed.activeWbs || 0}`);
    lines.push(`- WBS ปลายทาง + C1 ขึ้นไป: ${parsed.userEligibleWorkWbs || 0}`);
    lines.push(`- CN43N V8 นับจริง: ${parsed.countedWbs || primaryWbsCount(parsed)}`);
    lines.push(`- WBS ถูกตัดเพราะ Node/มีลูก: ${parsed.leafExcludedWbs || 0}`);
    lines.push(`- WBS ถูกตัดเพราะผู้รับผิดชอบว่าง: ${parsed.ownerExcludedWbs || 0}`);
    lines.push(`- WBS ถูกตัดเพราะยังไม่ถึง C1: ${parsed.userStatusExcludedWbs || 0}`);
    lines.push(`- WBS ถูกตัดเพราะยังไม่มี REL/TECO/CLSD: ${parsed.sapExcludedWbs || 0}`);
    lines.push(`- WBS ไม่ซ้ำทั้งหมด: ${parsed.uniqueWbs.length}`);
    lines.push(`- WBS งานจริง: ${parsed.workWbs}`);
    lines.push(`- WBS แม่/หัวโครงการ: ${parsed.parentWbs}`);
    if (type === 'zpsr055') {
      lines.push(`- User Status: ${Object.keys(parsed.userStatusCounts || {}).join(', ') || '-'}`);
      lines.push(`- System Status: ${Object.keys(parsed.systemStatusCounts || {}).join(', ') || '-'}`);
    }
    return lines.join('\n');
  }

  function setSummaryCard(type, parsed) {
    const el = $('sum-' + type);
    if (!el) return;
    const card = el.closest('.summary-card');
    el.textContent = primaryWbsCount(parsed) || '0';
    const small = card ? card.querySelector('small') : null;
    if (small) small.textContent = primaryWbsLabel(parsed);
  }

  function getOrParse(type) {
    const text = textOf(type);
    if (!text.trim()) return null;
    const parsed = parseByType(type, text);
    parsedCache[type] = parsed;
    setSummaryCard(type, parsed);
    return parsed;
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
    const parsed = getOrParse(type);
    resultBox.className = 'result-box';
    resultBox.innerHTML = previewHtml(parsed, type);
    lastSummaryText = summaryText(parsed, type);
    return parsed;
  }

  function getAllParsed() {
    const out = {};
    TYPES.forEach(type => {
      const text = textOf(type);
      if (text.trim()) out[type] = getOrParse(type);
    });
    return out;
  }

  function setDifference(a, b) {
    const bSet = new Set(b);
    return a.filter(x => !bSet.has(x));
  }

  function setIntersection(a, b) {
    const bSet = new Set(b);
    return a.filter(x => bSet.has(x));
  }

  function renderList(arr, limit) {
    if (!arr || !arr.length) return '-';
    const shown = arr.slice(0, limit || 25).join('\n');
    const more = arr.length > (limit || 25) ? `\n... อีก ${arr.length - (limit || 25)} รายการ` : '';
    return shown + more;
  }

  function compareWbsList(parsed) {
    // V8: ใช้รายการเดียวกับจำนวนหลักที่ใช้เทียบ
    // CN43N = Level > 2 และ User Status C1 ขึ้นไป, ZPSR048/ZPSR055 = User Status C1 ขึ้นไป, CN52N = WBS พัสดุที่พบ
    return eligibleWbsList(parsed);
  }

  function buildCompare(parsedMap) {
    const available = Object.keys(parsedMap).filter(k => parsedMap[k]);
    if (!available.length) {
      return { html: '<div class="compare-box empty">ยังไม่มีข้อมูลสำหรับเทียบ WBS</div>', text: 'ยังไม่มีข้อมูลสำหรับเทียบ WBS' };
    }

    const baseType = parsedMap.cn43n ? 'cn43n' : available[0];
    const base = compareWbsList(parsedMap[baseType]);
    const unionSet = new Set();
    available.forEach(t => compareWbsList(parsedMap[t]).forEach(w => unionSet.add(w)));
    const union = Array.from(unionSet).sort();
    const allCommon = available.reduce((acc, t) => setIntersection(acc, compareWbsList(parsedMap[t])), union);

    const summaryRows = available.map(t => {
      const p = parsedMap[t];
      const compareList = compareWbsList(p);
      const missingFromThis = setDifference(base, compareList);
      const extraInThis = setDifference(compareList, base);
      return {
        source: TYPE_LABELS[t],
        total: compareWbsList(p).length,
        work: p.workWbs,
        parent: p.parentWbs,
        duplicate: p.duplicateWbs.length,
        missing: t === baseType ? 0 : missingFromThis.length,
        extra: t === baseType ? 0 : extraInThis.length,
        missingList: missingFromThis,
        extraList: extraInThis
      };
    });

    const text = [
      'SAP Clipboard Preview V8 - WBS Cross-check',
      `ฐานเทียบ: ${TYPE_LABELS[baseType]}`,
      `WBS รวมทุกแหล่ง: ${union.length}`,
      `WBS ที่พบครบทุกแหล่งที่วาง: ${allCommon.length}`,
      '',
      ...summaryRows.map(r => `${r.source}: รวม ${r.total}, งานจริง ${r.work}, แม่ ${r.parent}, ซ้ำ ${r.duplicate}, ขาดจากฐาน ${r.missing}, เกินจากฐาน ${r.extra}`)
    ].join('\n');

    const rowsHtml = summaryRows.map(r => `
      <tr>
        <td>${escapeHtml(r.source)}</td>
        <td>${r.total}</td>
        <td>${r.work}</td>
        <td>${r.parent}</td>
        <td>${r.duplicate}</td>
        <td class="${r.missing ? 'bad' : 'ok'}">${r.missing}</td>
        <td class="${r.extra ? 'warn' : 'ok'}">${r.extra}</td>
      </tr>`).join('');

    const diffCards = summaryRows.filter(r => r.source !== TYPE_LABELS[baseType]).map(r => `
      <div class="diff-card">
        <h4>${escapeHtml(r.source)} เทียบกับ ${escapeHtml(TYPE_LABELS[baseType])}</h4>
        <div class="pill ${r.missing ? 'bad' : 'ok'}">ขาด ${r.missing}</div>
        <div class="pill ${r.extra ? 'warn' : 'ok'}">เกิน ${r.extra}</div>
        <p class="note">ขาดจาก ${escapeHtml(r.source)}</p>
        <div class="diff-list">${escapeHtml(renderList(r.missingList, 18))}</div>
        <p class="note">มีใน ${escapeHtml(r.source)} แต่ไม่อยู่ในฐาน</p>
        <div class="diff-list">${escapeHtml(renderList(r.extraList, 18))}</div>
      </div>`).join('');

    const html = `
      <div class="preview-block">
        <div class="preview-title">WBS Cross-check</div>
        <div class="kv">
          <span>ฐานเทียบ</span><span>${escapeHtml(TYPE_LABELS[baseType])}</span>
          <span>WBS รวมทุกแหล่ง</span><span>${union.length}</span>
          <span>WBS ที่พบครบทุกแหล่งที่วาง</span><span class="ok">${allCommon.length}</span>
          <span>แหล่งข้อมูลที่ใช้เทียบ</span><span>${available.map(t => TYPE_LABELS[t]).join(', ')}</span>
        </div>
        <div class="table-wrap">
          <table class="sample-table compact">
            <thead><tr><th>แหล่งข้อมูล</th><th>WBS ไม่ซ้ำ</th><th>งานจริง</th><th>แม่</th><th>ซ้ำ</th><th>ขาดจากฐาน</th><th>เกินจากฐาน</th></tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
        <div class="diff-grid">${diffCards || '<div class="note">วางข้อมูลมากกว่า 1 แหล่งเพื่อดูรายการขาด/เกิน</div>'}</div>
      </div>`;

    return { html, text };
  }

  function renderCompare() {
    const parsedMap = getAllParsed();
    const compare = buildCompare(parsedMap);
    const box = $('compareBox');
    box.className = 'compare-box';
    box.innerHTML = compare.html;
    lastCompareText = compare.text;
    return compare;
  }

  function previewAll() {
    const htmlParts = [];
    const textParts = [];
    parsedCache = {};
    TYPES.forEach(type => {
      const text = textOf(type);
      if (!text.trim()) {
        htmlParts.push(`<div class="preview-block"><div class="preview-title">${TYPE_LABELS[type]}</div><p class="warn">ยังไม่มีข้อมูล</p></div>`);
        textParts.push(`${TYPE_LABELS[type]}: ยังไม่มีข้อมูล`);
        return;
      }
      const parsed = getOrParse(type);
      htmlParts.push(previewHtml(parsed, type));
      textParts.push(summaryText(parsed, type));
    });
    const resultBox = $('resultBox');
    resultBox.className = 'result-box';
    resultBox.innerHTML = htmlParts.join('');
    lastSummaryText = textParts.join('\n\n');
    renderCompare();
  }

  function clearOne(type) {
    setText(type, '');
    delete parsedCache[type];
    const el = $('sum-' + type);
    if (el) {
      el.textContent = '-';
      const small = el.closest('.summary-card')?.querySelector('small');
      if (small) small.textContent = 'ยังไม่ตรวจ';
    }
  }

  function clearAll() {
    TYPES.forEach(clearOne);
    parsedCache = {};
    $('resultBox').className = 'result-box empty';
    $('resultBox').textContent = 'วางข้อมูลจาก SAP แล้วกด “ตรวจสอบ” เพื่อดู Preview';
    $('compareBox').className = 'compare-box empty';
    $('compareBox').textContent = 'กด “ตรวจสอบทั้งหมด” หรือ “เทียบ WBS” เพื่อดูผลเปรียบเทียบ';
    lastSummaryText = '';
    lastCompareText = '';
  }

  async function copyText(text) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      alert('คัดลอกแล้ว');
    } catch (err) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      alert('คัดลอกแล้ว');
    }
  }

  function bindEvents() {
    document.querySelectorAll('[data-preview]').forEach(btn => {
      btn.addEventListener('click', () => previewOne(btn.getAttribute('data-preview')));
    });
    document.querySelectorAll('[data-clear]').forEach(btn => {
      btn.addEventListener('click', () => clearOne(btn.getAttribute('data-clear')));
    });
    $('btnPreviewAll').addEventListener('click', previewAll);
    $('btnCompareOnly').addEventListener('click', renderCompare);
    $('btnClearAll').addEventListener('click', clearAll);
    $('btnCopySummary').addEventListener('click', () => copyText(lastSummaryText));
    $('btnCopyCompare').addEventListener('click', () => copyText(lastCompareText));
  }

  document.addEventListener('DOMContentLoaded', bindEvents);
})();
