// ========== 计件工资记账 App — 主逻辑 ==========

// ---- 全局状态 ----
let currentProject = localStorage.getItem('lastProject') || ''; // 记住上次选的项目
let lastWorker = localStorage.getItem('lastWorker') || '';       // 记住上次选的工人
let pendingDeleteId = null;
let isSaving = false;

// ---- 工具函数 ----
function today() { return new Date().toISOString().slice(0, 10); }
function monthStart() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function formatMoney(n) { return '¥' + n.toFixed(2); }

function showToast(msg, duration = 2000) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), duration);
}

// ---- 页面切换 ----
function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.getElementById('tab-' + tabName).classList.add('active');
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    if (tabName === 'record') refreshRecordPage();
    else if (tabName === 'stats') { refreshStats(); refreshHistory(); loadFilterSelects(); }
    else if (tabName === 'settings') { refreshProjects(); refreshWorkers(); loadWiProjectSelect(); loadExportProjectSelect(); }
}

// ========================================
//  记账页（首页）
// ========================================

async function refreshRecordPage() {
    const projects = (await db.getAllProjects()).reverse(); // 新项目排前面
    const bar = document.getElementById('project-bar');
    const emptyHint = document.getElementById('empty-hint');
    const workCards = document.getElementById('work-cards');

    // 如果没有选中的项目且有项目存在，自动选第一个
    if (!currentProject && projects.length > 0) {
        currentProject = projects[0].name;
        localStorage.setItem('lastProject', currentProject);
    }

    // 渲染项目切换栏（不含"全部"）
    bar.innerHTML = projects.map(p => `<button class="project-chip ${currentProject === p.name ? 'active' : ''}"
      data-project="${p.name}" onclick="selectProject(this)">${p.name}</button>`).join('');

    // 加载工作内容
    let items;
    if (currentProject) {
        items = await db.getWorkItemsByProject(currentProject);
    } else {
        items = await db.getAllWorkItems();
    }

    if (projects.length === 0) {
        emptyHint.style.display = 'block';
        workCards.innerHTML = '';
    } else if (items.length === 0) {
        emptyHint.style.display = 'none';
        workCards.innerHTML = `<div class="stat-empty" style="grid-column:1/-1;">
      ${currentProject ? '该项目暂无工作内容<br>请到「管理」页面添加' : '请选择一个项目'}
    </div>`;
    } else {
        emptyHint.style.display = 'none';
        workCards.innerHTML = items.map(i => `
      <div class="work-card" onclick="openQuickRecord('${i.projectName}', '${i.contentName}', ${i.unitPrice})">
        ${!currentProject ? `<div class="work-card-project">${i.projectName}</div>` : ''}
        <div class="work-card-name">${i.contentName}</div>
        <div class="work-card-price">¥${i.unitPrice.toFixed(2)}/件</div>
      </div>
    `).join('');
    }

    // 今日记录摘要
    await refreshTodaySummary();
}

function selectProject(el) {
    currentProject = el.dataset.project;
    localStorage.setItem('lastProject', currentProject);
    document.querySelectorAll('.project-chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    refreshRecordPage();
}

async function refreshTodaySummary() {
    const records = await db.getFilteredRecords({
        startDate: today(),
        endDate: today(),
        projectName: currentProject || undefined
    });

    const container = document.getElementById('today-summary');
    const list = document.getElementById('today-list');

    if (records.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';
    const total = records.reduce((s, r) => s + r.totalPrice, 0);

    list.innerHTML = records.map(r => `
    <div class="today-item">
      <div class="today-item-left">
        <span class="today-item-worker">${r.workerName} — ${r.workContent}</span>
        <span class="today-item-content">${r.quantity} × ¥${r.unitPrice.toFixed(2)}</span>
      </div>
      <span class="today-item-amount">${formatMoney(r.totalPrice)}</span>
    </div>
  `).join('') + `
    <div class="today-item" style="background:rgba(105,240,174,0.06);border-color:rgba(105,240,174,0.15);">
      <span style="font-size:17px;font-weight:600;">今日合计</span>
      <span class="today-item-amount">${formatMoney(total)}</span>
    </div>
  `;
}

// ========================================
//  快速记账弹窗
// ========================================

async function openQuickRecord(projectName, contentName, unitPrice) {
    document.getElementById('modal-title').textContent = '记账';
    document.getElementById('record-id').value = '';
    document.getElementById('record-project').value = projectName;
    document.getElementById('record-content').value = contentName;
    document.getElementById('record-price-hidden').value = unitPrice;
    document.getElementById('record-date').value = today();
    document.getElementById('record-qty').value = '';
    document.getElementById('calc-total').textContent = '¥0.00';

    // 显示选中的工作内容
    document.getElementById('work-label').textContent = contentName;
    document.getElementById('work-price').textContent = `¥${unitPrice.toFixed(2)}/件`;

    // 加载工人按钮
    const workers = await db.getAllWorkers();
    const btns = document.getElementById('worker-buttons');

    if (workers.length === 0) {
        btns.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text-secondary);padding:12px;">请先到「管理」添加工人</div>';
    } else {
        btns.innerHTML = workers.map(w =>
            `<button type="button" class="worker-btn ${w.name === lastWorker ? 'active' : ''}"
        onclick="selectWorker(this, '${w.name}')">${w.name}</button>`
        ).join('');
    }

    document.getElementById('record-modal').classList.add('show');

    // 自动聚焦到数量输入框
    setTimeout(() => document.getElementById('record-qty').focus(), 350);
}

function selectWorker(btn, name) {
    document.querySelectorAll('.worker-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    lastWorker = name;
    localStorage.setItem('lastWorker', name);
}

function closeModal() {
    document.getElementById('record-modal').classList.remove('show');
}

function calcTotal() {
    const qty = parseFloat(document.getElementById('record-qty').value) || 0;
    const price = parseFloat(document.getElementById('record-price-hidden').value) || 0;
    document.getElementById('calc-total').textContent = formatMoney(qty * price);
}

async function saveRecord() {
    if (isSaving) return;

    const id = document.getElementById('record-id').value;
    const projectName = document.getElementById('record-project').value;
    const date = document.getElementById('record-date').value;
    const workContent = document.getElementById('record-content').value;
    const unitPrice = document.getElementById('record-price-hidden').value;
    const quantity = document.getElementById('record-qty').value;

    // 获取选中的工人
    const activeWorkerBtn = document.querySelector('.worker-btn.active');
    const workerName = activeWorkerBtn ? activeWorkerBtn.textContent : '';

    if (!workerName) { showToast('请选择工人'); return; }
    if (!quantity || parseFloat(quantity) <= 0) { showToast('请输入数量'); return; }

    isSaving = true;
    document.getElementById('save-btn').disabled = true;

    try {
        const data = { projectName, date, workerName, workContent, quantity, unitPrice };

        if (id) {
            const records = await db.getAllRecords();
            const existing = records.find(r => r.id === parseInt(id));
            await db.updateRecord({ ...existing, ...data });
            showToast('已更新 ✅');
        } else {
            await db.addRecord(data);
            showToast('已保存 ✅');
        }

        closeModal();
        refreshRecordPage();
    } catch (err) {
        showToast('保存失败: ' + err.message);
    } finally {
        isSaving = false;
        document.getElementById('save-btn').disabled = false;
    }
}

// ========================================
//  统计页
// ========================================

async function loadFilterSelects() {
    const projects = await db.getAllProjects();
    const workers = await db.getAllWorkers();

    const fp = document.getElementById('filter-project');
    const v1 = fp.value;
    fp.innerHTML = '<option value="">全部项目</option>' +
        projects.map(p => `<option value="${p.name}">${p.name}</option>`).join('');
    fp.value = v1;

    const fw = document.getElementById('filter-worker');
    const v2 = fw.value;
    fw.innerHTML = '<option value="">全部工人</option>' +
        workers.map(w => `<option value="${w.name}">${w.name}</option>`).join('');
    fw.value = v2;
}

async function refreshStats() {
    const startDate = document.getElementById('stat-start').value;
    const endDate = document.getElementById('stat-end').value;
    const projectName = document.getElementById('filter-project').value;

    const byWorker = await db.getStatsByWorker(startDate, endDate, projectName);
    const byContent = await db.getStatsByContent(startDate, endDate, projectName);

    const totalAmount = byWorker.reduce((s, w) => s + w.totalAmount, 0);
    const totalQty = byWorker.reduce((s, w) => s + w.totalQty, 0);
    document.getElementById('summary-amount').textContent = formatMoney(totalAmount);
    document.getElementById('summary-count').textContent = byWorker.length;
    document.getElementById('summary-qty').textContent = totalQty.toFixed(1);
    document.getElementById('summary-items').textContent = byContent.length;

    const wb = document.getElementById('worker-stats-body');
    wb.innerHTML = byWorker.length === 0
        ? '<tr><td colspan="3" class="stat-empty">暂无数据</td></tr>'
        : byWorker.map(w => `<tr><td>${w.name}</td><td>${w.totalQty.toFixed(1)}</td><td style="text-align:right;font-weight:600;color:var(--success);">${formatMoney(w.totalAmount)}</td></tr>`).join('');

    const cb = document.getElementById('content-stats-body');
    cb.innerHTML = byContent.length === 0
        ? '<tr><td colspan="3" class="stat-empty">暂无数据</td></tr>'
        : byContent.map(c => `<tr><td>${c.content}</td><td>${c.totalQty.toFixed(1)}</td><td style="text-align:right;font-weight:600;color:var(--success);">${formatMoney(c.totalAmount)}</td></tr>`).join('');

    // 交叉统计：工作内容 × 工人
    try {
        const byCW = await db.getStatsByContentWorker(startDate, endDate, projectName);
        console.log('交叉统计数据:', JSON.stringify(byCW));
        const cwDiv = document.getElementById('content-worker-stats');
        if (!byCW || byCW.length === 0) {
            cwDiv.innerHTML = '<div class="stat-empty">暂无数据</div>';
        } else {
            cwDiv.innerHTML = byCW.map(g => `
                <div style="margin-bottom:16px;">
                    <div style="font-size:17px;font-weight:600;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
                        <span>${g.content}</span>
                        <span style="color:var(--success);font-size:15px;">共${g.totalQty.toFixed(1)}件 ${formatMoney(g.totalAmount)}</span>
                    </div>
                    ${g.workers.map(w => `
                        <div style="display:flex;justify-content:space-between;padding:8px 12px;background:var(--bg-input);border-radius:8px;margin-bottom:4px;font-size:16px;">
                            <span>${w.name}</span>
                            <span><span style="color:var(--text-secondary);">${w.qty.toFixed(1)}件</span> &nbsp; <span style="color:var(--success);font-weight:600;">${formatMoney(w.amount)}</span></span>
                        </div>
                    `).join('')}
                </div>
            `).join('');
        }
    } catch (err) {
        console.error('交叉统计出错:', err);
        document.getElementById('content-worker-stats').innerHTML = '<div class="stat-empty">加载出错</div>';
    }
}

async function refreshHistory() {
    const filters = {
        projectName: document.getElementById('filter-project').value,
        startDate: document.getElementById('stat-start').value,
        endDate: document.getElementById('stat-end').value,
        workerName: document.getElementById('filter-worker').value
    };
    Object.keys(filters).forEach(k => { if (!filters[k]) delete filters[k]; });

    const records = await db.getFilteredRecords(filters);
    const list = document.getElementById('record-list');

    if (records.length === 0) {
        list.innerHTML = '<div class="stat-empty">暂无记录</div>';
        return;
    }

    list.innerHTML = records.map(r => `
    <div class="record-item" data-id="${r.id}">
      <div class="record-header">
        <span class="record-date">${r.date}</span>
        <div style="display:flex;gap:6px;align-items:center;">
          ${r.projectName ? `<span class="record-project-tag">${r.projectName}</span>` : ''}
          <span class="record-worker">${r.workerName}</span>
        </div>
      </div>
      <div class="record-content">${r.workContent}</div>
      <div class="record-calc">
        <span>${r.quantity} × ¥${r.unitPrice.toFixed(2)}</span>
        <span class="record-total">${formatMoney(r.totalPrice)}</span>
      </div>
      <div class="record-actions">
        <button class="btn btn-outline btn-small" onclick="openEditModal(${r.id})">编辑</button>
        <button class="btn btn-danger btn-small" onclick="confirmDeleteRecord(${r.id})">删除</button>
      </div>
    </div>
  `).join('');
}

// 编辑记录（复用快速记账弹窗）
async function openEditModal(id) {
    const records = await db.getAllRecords();
    const r = records.find(rec => rec.id === id);
    if (!r) return;

    document.getElementById('modal-title').textContent = '编辑记录';
    document.getElementById('record-id').value = r.id;
    document.getElementById('record-project').value = r.projectName;
    document.getElementById('record-content').value = r.workContent;
    document.getElementById('record-price-hidden').value = r.unitPrice;
    document.getElementById('record-date').value = r.date;
    document.getElementById('record-qty').value = r.quantity;

    document.getElementById('work-label').textContent = r.workContent;
    document.getElementById('work-price').textContent = `¥${r.unitPrice.toFixed(2)}/件`;
    document.getElementById('calc-total').textContent = formatMoney(r.totalPrice);

    const workers = await db.getAllWorkers();
    document.getElementById('worker-buttons').innerHTML = workers.map(w =>
        `<button type="button" class="worker-btn ${w.name === r.workerName ? 'active' : ''}"
      onclick="selectWorker(this, '${w.name}')">${w.name}</button>`
    ).join('');

    document.getElementById('record-modal').classList.add('show');
}

// ---- 删除记录 ----
function confirmDeleteRecord(id) {
    pendingDeleteId = id;
    document.getElementById('confirm-msg').textContent = '确定要删除这条记录吗？';
    document.getElementById('confirm-overlay').classList.add('show');
    document.getElementById('confirm-yes').onclick = executeDelete;
}

async function executeDelete() {
    if (pendingDeleteId !== null) {
        await db.deleteRecord(pendingDeleteId);
        pendingDeleteId = null;
        showToast('已删除');
        refreshHistory();
        refreshStats();
        refreshRecordPage();
    }
    closeConfirm();
}

function closeConfirm() {
    document.getElementById('confirm-overlay').classList.remove('show');
    pendingDeleteId = null;
}

// ========================================
//  管理页
// ========================================

// ---- 项目管理 ----
async function refreshProjects() {
    const projects = await db.getAllProjects();
    const list = document.getElementById('project-list');
    if (projects.length === 0) {
        list.innerHTML = '<div class="stat-empty">暂无项目</div>';
        return;
    }
    list.innerHTML = '';
    for (const p of projects) {
        const hasRecords = await db.projectHasRecords(p.name);
        list.innerHTML += `
      <div class="manage-item">
        <span class="manage-item-name">${p.name}</span>
        ${hasRecords ? '<span class="manage-item-sub">有记录</span>' :
                `<button class="manage-item-delete" onclick="deleteProject(${p.id}, '${p.name}')">🗑️</button>`}
      </div>`;
    }
}

async function addProject() {
    const input = document.getElementById('new-project-name');
    const name = input.value.trim();
    if (!name) { showToast('请输入项目名称'); return; }
    try {
        await db.addProject(name);
        input.value = '';
        showToast('项目已添加 ✅');
        refreshProjects();
        loadWiProjectSelect();
    } catch (err) {
        if (err.name === 'ConstraintError') showToast('该项目已存在');
        else showToast('添加失败');
    }
}

async function deleteProject(id, name) {
    const hasRecords = await db.projectHasRecords(name);
    if (hasRecords) { showToast('该项目有记录，无法删除'); return; }
    document.getElementById('confirm-msg').textContent = `确定删除项目"${name}"？`;
    document.getElementById('confirm-overlay').classList.add('show');
    document.getElementById('confirm-yes').onclick = async () => {
        await db.deleteProject(id);
        showToast('已删除');
        refreshProjects();
        loadWiProjectSelect();
        closeConfirm();
        document.getElementById('confirm-yes').onclick = executeDelete;
    };
}

// ---- 工作内容管理 ----
async function loadWiProjectSelect() {
    const projects = await db.getAllProjects();
    const sel = document.getElementById('wi-project');
    const v = sel.value;
    sel.innerHTML = '<option value="">请选择项目</option>' +
        projects.map(p => `<option value="${p.name}">${p.name}</option>`).join('');
    sel.value = v;
}

async function onWiProjectChange() {
    const pn = document.getElementById('wi-project').value;
    if (!pn) {
        document.getElementById('wi-list').innerHTML = '<div class="stat-empty">请先选择项目</div>';
        return;
    }
    await refreshWorkItems(pn);
}

async function refreshWorkItems(projectName) {
    if (!projectName) projectName = document.getElementById('wi-project').value;
    if (!projectName) return;
    const items = await db.getWorkItemsByProject(projectName);
    const list = document.getElementById('wi-list');
    if (items.length === 0) {
        list.innerHTML = '<div class="stat-empty">暂无工作内容</div>';
        return;
    }
    list.innerHTML = items.map(i => `
    <div class="manage-item">
      <div>
        <span class="manage-item-name">${i.contentName}</span>
        <span style="font-size:16px;color:var(--success);margin-left:8px;">¥${i.unitPrice.toFixed(2)}</span>
      </div>
      <button class="manage-item-delete" onclick="deleteWorkItem(${i.id})">🗑️</button>
    </div>
  `).join('');
}

async function addWorkItem() {
    const pn = document.getElementById('wi-project').value;
    const cn = document.getElementById('wi-content-name').value.trim();
    const up = document.getElementById('wi-unit-price').value;
    if (!pn) { showToast('请先选择项目'); return; }
    if (!cn) { showToast('请输入工作内容名称'); return; }
    if (!up || parseFloat(up) <= 0) { showToast('请输入有效单价'); return; }
    try {
        await db.addWorkItem(pn, cn, up);
        document.getElementById('wi-content-name').value = '';
        document.getElementById('wi-unit-price').value = '';
        showToast('已添加 ✅');
        refreshWorkItems(pn);
    } catch (err) {
        if (err.name === 'ConstraintError') showToast('该工作内容已存在');
        else showToast('添加失败');
    }
}

async function deleteWorkItem(id) {
    document.getElementById('confirm-msg').textContent = '确定删除这个工作内容？';
    document.getElementById('confirm-overlay').classList.add('show');
    document.getElementById('confirm-yes').onclick = async () => {
        await db.deleteWorkItem(id);
        showToast('已删除');
        refreshWorkItems();
        closeConfirm();
        document.getElementById('confirm-yes').onclick = executeDelete;
    };
}

// ---- 工人管理 ----
async function refreshWorkers() {
    const workers = await db.getAllWorkers();
    const list = document.getElementById('worker-list');
    if (workers.length === 0) {
        list.innerHTML = '<div class="stat-empty">暂无工人</div>';
        return;
    }
    list.innerHTML = '';
    for (const w of workers) {
        const hasRecords = await db.workerHasRecords(w.name);
        list.innerHTML += `
      <div class="manage-item">
        <span class="manage-item-name">${w.name}</span>
        ${hasRecords ? '<span class="manage-item-sub">有记录</span>' :
                `<button class="manage-item-delete" onclick="deleteWorker(${w.id}, '${w.name}')">🗑️</button>`}
      </div>`;
    }
}

async function addWorker() {
    const input = document.getElementById('new-worker-name');
    const name = input.value.trim();
    if (!name) { showToast('请输入工人姓名'); return; }
    try {
        await db.addWorker(name);
        input.value = '';
        showToast('工人已添加 ✅');
        refreshWorkers();
    } catch (err) {
        if (err.name === 'ConstraintError') showToast('该工人已存在');
        else showToast('添加失败');
    }
}

async function deleteWorker(id, name) {
    const hasRecords = await db.workerHasRecords(name);
    if (hasRecords) { showToast('该工人有记录，无法删除'); return; }
    document.getElementById('confirm-msg').textContent = `确定删除工人"${name}"？`;
    document.getElementById('confirm-overlay').classList.add('show');
    document.getElementById('confirm-yes').onclick = async () => {
        await db.deleteWorker(id);
        showToast('已删除');
        refreshWorkers();
        closeConfirm();
        document.getElementById('confirm-yes').onclick = executeDelete;
    };
}

// 清除缓存
async function clearCache() {
    try {
        // 注销 Service Worker（仅 HTTPS 下可用）
        if ('serviceWorker' in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            for (const reg of regs) { await reg.unregister(); }
        }
        // 清除所有缓存
        if ('caches' in window) {
            const keys = await caches.keys();
            for (const key of keys) { await caches.delete(key); }
        }
        showToast('缓存已清除，正在刷新...');
        setTimeout(() => location.reload(true), 1000);
    } catch (err) {
        showToast('清除失败: ' + err.message);
    }
}

// 数据导出
// 加载导出项目选择器
async function loadExportProjectSelect() {
    const projects = await db.getAllProjects();
    const sel = document.getElementById('export-project');
    const v = sel.value;
    sel.innerHTML = '<option value="">全部项目</option>' +
        projects.map(p => `<option value="${p.name}">${p.name}</option>`).join('');
    sel.value = v;
}

// 数据导出（按项目）
async function exportData() {
    const projectName = document.getElementById('export-project').value;
    const filters = {};
    if (projectName) filters.projectName = projectName;

    const records = await db.getFilteredRecords(filters);
    if (records.length === 0) { showToast('暂无数据'); return; }

    await db.exportCSV(filters);
    showToast(`已导出 ${records.length} 条记录 ✅`);
}

// CSV 导入
async function importCSV(event) {
    const file = event.target.files[0];
    if (!file) return;

    const text = await file.text();
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);

    if (lines.length < 2) {
        showToast('CSV 文件为空或格式不对');
        event.target.value = '';
        return;
    }

    // 解析标题行确认格式
    const header = lines[0].replace(/^\uFEFF/, ''); // 去掉 BOM
    const expectedHeaders = ['项目', '日期', '工人姓名', '工作内容', '数量', '单价', '总价'];
    const headerCols = header.split(',');

    // 简单校验列数
    if (headerCols.length < 6) {
        showToast('CSV 格式不正确，请使用导出的文件');
        event.target.value = '';
        return;
    }

    let imported = 0;
    let skipped = 0;

    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',');
        if (cols.length < 6) { skipped++; continue; }

        const projectName = cols[0].trim();
        const date = cols[1].trim();
        const workerName = cols[2].trim();
        const workContent = cols[3].trim();
        const quantity = cols[4].trim();
        const unitPrice = cols[5].trim();

        // 基本校验
        if (!date || !workerName || !workContent || !quantity || !unitPrice) {
            skipped++;
            continue;
        }

        try {
            await db.addRecord({ projectName, date, workerName, workContent, quantity, unitPrice });
            imported++;
        } catch (err) {
            skipped++;
        }
    }

    event.target.value = ''; // 重置文件选择
    showToast(`导入完成：成功 ${imported} 条${skipped > 0 ? `，跳过 ${skipped} 条` : ''}`);
    refreshRecordPage();
}

// ========================================
//  初始化
// ========================================
async function initApp() {
    await db.open();

    document.getElementById('stat-start').value = monthStart();
    document.getElementById('stat-end').value = today();

    await refreshRecordPage();

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(() => { });
    }
}

document.addEventListener('DOMContentLoaded', initApp);
