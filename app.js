// ========== 计件工资记账 App 主逻辑 ==========

// ---- 全局状态 ----
let currentProject = ''; // 当前选中的项目名（空 = 全部项目）
let isSaving = false;    // 防重复提交
let pendingDeleteId = null;
let currentWorkItems = []; // 当前项目的工作内容列表（缓存）

// ---- 工具函数 ----

function today() {
    return new Date().toISOString().slice(0, 10);
}

function monthStart() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function formatMoney(n) {
    return '¥' + n.toFixed(2);
}

function showToast(msg, duration = 2000) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), duration);
}

// ---- 项目选择器 ----
async function loadProjectSelectors() {
    const projects = await db.getAllProjects();
    const allOptions = '<option value="">全部项目</option>' +
        projects.map(p => `<option value="${p.name}">${p.name}</option>`).join('');
    const pickOptions = '<option value="">请选择项目</option>' +
        projects.map(p => `<option value="${p.name}">${p.name}</option>`).join('');

    ['global-project', 'filter-project'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { const v = el.value; el.innerHTML = allOptions; el.value = v; }
    });

    const rp = document.getElementById('record-project');
    if (rp) { const v = rp.value; rp.innerHTML = pickOptions; rp.value = v; }

    // 设置页的工作内容管理项目选择
    const wip = document.getElementById('wi-project');
    if (wip) { const v = wip.value; wip.innerHTML = pickOptions; wip.value = v; }
}

function onGlobalProjectChange() {
    currentProject = document.getElementById('global-project').value;
    const filterProject = document.getElementById('filter-project');
    if (filterProject) filterProject.value = currentProject;
    const activeTab = document.querySelector('.tab-content.active');
    if (activeTab) {
        if (activeTab.id === 'tab-stats') refreshStats();
        else if (activeTab.id === 'tab-history') refreshHistory();
    }
}

// ---- 页面切换 ----
function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.getElementById('tab-' + tabName).classList.add('active');
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    if (tabName === 'stats') refreshStats();
    else if (tabName === 'history') refreshHistory();
    else if (tabName === 'settings') { refreshWorkers(); refreshProjects(); loadProjectSelectors(); }
}

// ---- 统计页 ----
async function refreshStats() {
    const startDate = document.getElementById('stat-start').value;
    const endDate = document.getElementById('stat-end').value;
    const projectName = currentProject;

    const byWorker = await db.getStatsByWorker(startDate, endDate, projectName);
    const byContent = await db.getStatsByContent(startDate, endDate, projectName);

    const totalAmount = byWorker.reduce((s, w) => s + w.totalAmount, 0);
    const totalQty = byWorker.reduce((s, w) => s + w.totalQty, 0);
    document.getElementById('summary-amount').textContent = formatMoney(totalAmount);
    document.getElementById('summary-count').textContent = byWorker.length;
    document.getElementById('summary-qty').textContent = totalQty.toFixed(1);
    document.getElementById('summary-items').textContent = byContent.length;

    const workerBody = document.getElementById('worker-stats-body');
    workerBody.innerHTML = byWorker.length === 0
        ? '<tr><td colspan="3" class="stat-empty">暂无数据</td></tr>'
        : byWorker.map(w => `<tr><td>${w.name}</td><td>${w.totalQty.toFixed(1)}</td><td class="amount">${formatMoney(w.totalAmount)}</td></tr>`).join('');

    const contentBody = document.getElementById('content-stats-body');
    contentBody.innerHTML = byContent.length === 0
        ? '<tr><td colspan="3" class="stat-empty">暂无数据</td></tr>'
        : byContent.map(c => `<tr><td>${c.content}</td><td>${c.totalQty.toFixed(1)}</td><td class="amount">${formatMoney(c.totalAmount)}</td></tr>`).join('');
}

// ---- 历史记录页 ----
async function refreshHistory() {
    const filters = {
        projectName: document.getElementById('filter-project').value || currentProject,
        startDate: document.getElementById('filter-start').value,
        endDate: document.getElementById('filter-end').value,
        workerName: document.getElementById('filter-worker').value,
        workContent: document.getElementById('filter-content').value
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

async function loadFilterWorkers() {
    const workers = await db.getAllWorkers();
    const select = document.getElementById('filter-worker');
    const current = select.value;
    select.innerHTML = '<option value="">全部工人</option>' +
        workers.map(w => `<option value="${w.name}">${w.name}</option>`).join('');
    select.value = current;
}

// ---- 记账弹窗 ----

// 当记账弹窗中选择项目后，加载该项目的工作内容下拉
async function onRecordProjectChange() {
    const projectName = document.getElementById('record-project').value;
    const contentSelect = document.getElementById('record-content');
    const priceInput = document.getElementById('record-price');

    if (!projectName) {
        contentSelect.innerHTML = '<option value="">请先选择项目</option>';
        priceInput.value = '';
        calcTotal();
        return;
    }

    const items = await db.getWorkItemsByProject(projectName);
    currentWorkItems = items;

    if (items.length === 0) {
        contentSelect.innerHTML = '<option value="">该项目暂无工作内容</option>';
    } else {
        contentSelect.innerHTML = '<option value="">请选择工作内容</option>' +
            items.map(i => `<option value="${i.contentName}" data-price="${i.unitPrice}">${i.contentName}（¥${i.unitPrice.toFixed(2)}）</option>`).join('');
    }
    priceInput.value = '';
    calcTotal();
}

// 选择工作内容后自动填入单价
function onRecordContentChange() {
    const contentSelect = document.getElementById('record-content');
    const priceInput = document.getElementById('record-price');
    const selected = contentSelect.options[contentSelect.selectedIndex];

    if (selected && selected.dataset.price) {
        priceInput.value = selected.dataset.price;
        calcTotal();
    }
}

function openAddModal() {
    document.getElementById('modal-title').textContent = '新增记账';
    document.getElementById('record-form').reset();
    document.getElementById('record-date').value = today();
    document.getElementById('record-id').value = '';
    document.getElementById('calc-total').textContent = '¥0.00';
    document.getElementById('record-content').innerHTML = '<option value="">请先选择项目</option>';

    loadModalWorkers();
    loadProjectSelectors();

    // 自动设置当前项目并加载工作内容
    setTimeout(async () => {
        const sel = document.getElementById('record-project');
        if (sel && currentProject) {
            sel.value = currentProject;
            await onRecordProjectChange();
        }
    }, 50);

    document.getElementById('record-modal').classList.add('show');
}

async function openEditModal(id) {
    const records = await db.getAllRecords();
    const record = records.find(r => r.id === id);
    if (!record) return;

    document.getElementById('modal-title').textContent = '编辑记录';
    document.getElementById('record-id').value = record.id;
    document.getElementById('record-date').value = record.date;
    document.getElementById('record-qty').value = record.quantity;
    document.getElementById('record-price').value = record.unitPrice;
    document.getElementById('calc-total').textContent = formatMoney(record.totalPrice);

    await loadModalWorkers();
    await loadProjectSelectors();

    document.getElementById('record-project').value = record.projectName || '';
    document.getElementById('record-worker').value = record.workerName;

    // 加载该项目的工作内容，然后选中
    await onRecordProjectChange();
    document.getElementById('record-content').value = record.workContent;
    // 恢复单价（可能已被 onRecordProjectChange 清掉）
    document.getElementById('record-price').value = record.unitPrice;
    calcTotal();

    document.getElementById('record-modal').classList.add('show');
}

function closeModal() {
    document.getElementById('record-modal').classList.remove('show');
}

async function loadModalWorkers() {
    const workers = await db.getAllWorkers();
    const select = document.getElementById('record-worker');
    select.innerHTML = '<option value="">请选择工人</option>' +
        workers.map(w => `<option value="${w.name}">${w.name}</option>`).join('');
}

function calcTotal() {
    const qty = parseFloat(document.getElementById('record-qty').value) || 0;
    const price = parseFloat(document.getElementById('record-price').value) || 0;
    document.getElementById('calc-total').textContent = formatMoney(qty * price);
}

async function saveRecord() {
    if (isSaving) return;

    const id = document.getElementById('record-id').value;
    const projectName = document.getElementById('record-project').value;
    const date = document.getElementById('record-date').value;
    const workerName = document.getElementById('record-worker').value;
    const workContent = document.getElementById('record-content').value;
    const quantity = document.getElementById('record-qty').value;
    const unitPrice = document.getElementById('record-price').value;

    if (!projectName) { showToast('请选择项目'); return; }
    if (!date) { showToast('请选择日期'); return; }
    if (!workerName) { showToast('请选择工人'); return; }
    if (!workContent) { showToast('请选择工作内容'); return; }
    if (!quantity || parseFloat(quantity) <= 0) { showToast('请输入有效数量'); return; }
    if (!unitPrice || parseFloat(unitPrice) <= 0) { showToast('请输入有效单价'); return; }

    isSaving = true;
    document.getElementById('save-btn').disabled = true;

    try {
        const data = { projectName, date, workerName, workContent, quantity, unitPrice };

        if (id) {
            const records = await db.getAllRecords();
            const existing = records.find(r => r.id === parseInt(id));
            await db.updateRecord({ ...existing, ...data });
            showToast('记录已更新');
        } else {
            await db.addRecord(data);
            showToast('记录已保存');
        }

        closeModal();
        refreshStats();
        refreshHistory();
    } catch (err) {
        showToast('保存失败: ' + err.message);
    } finally {
        isSaving = false;
        document.getElementById('save-btn').disabled = false;
    }
}

// ---- 删除记录确认 ----

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
        showToast('记录已删除');
        refreshHistory();
        refreshStats();
    }
    closeConfirm();
}

function closeConfirm() {
    document.getElementById('confirm-overlay').classList.remove('show');
    pendingDeleteId = null;
}

// ---- 项目管理 ----
async function refreshProjects() {
    const projects = await db.getAllProjects();
    const list = document.getElementById('project-list');

    if (projects.length === 0) {
        list.innerHTML = '<div class="stat-empty">暂无项目，请先添加</div>';
        return;
    }

    list.innerHTML = '';
    for (const p of projects) {
        const hasRecords = await db.projectHasRecords(p.name);
        list.innerHTML += `
      <div class="worker-item">
        <span class="worker-name">${p.name}</span>
        ${hasRecords ? '<span style="font-size:12px;color:var(--text-secondary)">有记录</span>' :
                `<button class="worker-delete" onclick="deleteProject(${p.id}, '${p.name}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
            </svg>
          </button>`
            }
      </div>
    `;
    }
}

async function addProject() {
    const input = document.getElementById('new-project-name');
    const name = input.value.trim();
    if (!name) { showToast('请输入项目名称'); return; }

    try {
        await db.addProject(name);
        input.value = '';
        showToast('项目已添加');
        refreshProjects();
        loadProjectSelectors();
    } catch (err) {
        if (err.name === 'ConstraintError') showToast('该项目已存在');
        else showToast('添加失败: ' + err.message);
    }
}

async function deleteProject(id, name) {
    const hasRecords = await db.projectHasRecords(name);
    if (hasRecords) { showToast('该项目有记录，无法删除'); return; }

    document.getElementById('confirm-msg').textContent = `确定要删除项目"${name}"吗？`;
    document.getElementById('confirm-overlay').classList.add('show');
    document.getElementById('confirm-yes').onclick = async () => {
        await db.deleteProject(id);
        showToast('项目已删除');
        refreshProjects();
        loadProjectSelectors();
        closeConfirm();
        document.getElementById('confirm-yes').onclick = executeDelete;
    };
}

// ---- 工作内容管理 ----

// 设置页：项目选择后加载工作内容列表
async function onWiProjectChange() {
    const projectName = document.getElementById('wi-project').value;
    if (!projectName) {
        document.getElementById('wi-list').innerHTML = '<div class="stat-empty">请先选择项目</div>';
        return;
    }
    await refreshWorkItems(projectName);
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
    <div class="worker-item">
      <div>
        <span class="worker-name">${i.contentName}</span>
        <span style="font-size:13px;color:var(--success);margin-left:8px;">¥${i.unitPrice.toFixed(2)}</span>
      </div>
      <button class="worker-delete" onclick="deleteWorkItem(${i.id})">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
        </svg>
      </button>
    </div>
  `).join('');
}

async function addWorkItem() {
    const projectName = document.getElementById('wi-project').value;
    const contentName = document.getElementById('wi-content-name').value.trim();
    const unitPrice = document.getElementById('wi-unit-price').value;

    if (!projectName) { showToast('请先选择项目'); return; }
    if (!contentName) { showToast('请输入工作内容名称'); return; }
    if (!unitPrice || parseFloat(unitPrice) <= 0) { showToast('请输入有效单价'); return; }

    try {
        await db.addWorkItem(projectName, contentName, unitPrice);
        document.getElementById('wi-content-name').value = '';
        document.getElementById('wi-unit-price').value = '';
        showToast('工作内容已添加');
        refreshWorkItems(projectName);
    } catch (err) {
        if (err.name === 'ConstraintError') showToast('该工作内容已存在');
        else showToast('添加失败: ' + err.message);
    }
}

async function deleteWorkItem(id) {
    document.getElementById('confirm-msg').textContent = '确定要删除这个工作内容吗？';
    document.getElementById('confirm-overlay').classList.add('show');
    document.getElementById('confirm-yes').onclick = async () => {
        await db.deleteWorkItem(id);
        showToast('工作内容已删除');
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
        list.innerHTML = '<div class="stat-empty">暂无工人，请先添加</div>';
        return;
    }

    list.innerHTML = '';
    for (const w of workers) {
        const hasRecords = await db.workerHasRecords(w.name);
        list.innerHTML += `
      <div class="worker-item">
        <span class="worker-name">${w.name}</span>
        ${hasRecords ? '<span style="font-size:12px;color:var(--text-secondary)">有记录</span>' :
                `<button class="worker-delete" onclick="deleteWorker(${w.id}, '${w.name}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
            </svg>
          </button>`
            }
      </div>
    `;
    }
}

async function addWorker() {
    const input = document.getElementById('new-worker-name');
    const name = input.value.trim();
    if (!name) { showToast('请输入工人姓名'); return; }

    try {
        await db.addWorker(name);
        input.value = '';
        showToast('工人已添加');
        refreshWorkers();
        loadFilterWorkers();
    } catch (err) {
        if (err.name === 'ConstraintError') showToast('该工人已存在');
        else showToast('添加失败: ' + err.message);
    }
}

async function deleteWorker(id, name) {
    const hasRecords = await db.workerHasRecords(name);
    if (hasRecords) { showToast('该工人有记录，无法删除'); return; }

    document.getElementById('confirm-msg').textContent = `确定要删除工人"${name}"吗？`;
    document.getElementById('confirm-overlay').classList.add('show');
    document.getElementById('confirm-yes').onclick = async () => {
        await db.deleteWorker(id);
        showToast('工人已删除');
        refreshWorkers();
        loadFilterWorkers();
        closeConfirm();
        document.getElementById('confirm-yes').onclick = executeDelete;
    };
}

// 数据导出
async function exportData() {
    const records = await db.getAllRecords();
    if (records.length === 0) { showToast('暂无数据可导出'); return; }
    const filters = {};
    if (currentProject) filters.projectName = currentProject;
    await db.exportCSV(filters);
    showToast('CSV 文件已下载');
}

// ---- App 初始化 ----
async function initApp() {
    await db.open();

    document.getElementById('stat-start').value = monthStart();
    document.getElementById('stat-end').value = today();
    document.getElementById('filter-start').value = monthStart();
    document.getElementById('filter-end').value = today();

    await loadProjectSelectors();
    await refreshStats();
    await loadFilterWorkers();

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(() => { });
    }
}

document.addEventListener('DOMContentLoaded', initApp);
