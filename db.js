// ========== IndexedDB 数据库封装 ==========
// 提供项目、工人、工作内容和记账记录的增删改查操作

class BookkeepingDB {
    constructor() {
        this.dbName = 'BookkeepingApp';
        this.dbVersion = 3; // 版本3：新增工作内容表
        this.db = null;
    }

    // 打开（或创建）数据库
    async open() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                const tx = e.target.transaction;

                // 项目表
                if (!db.objectStoreNames.contains('projects')) {
                    const projectStore = db.createObjectStore('projects', { keyPath: 'id', autoIncrement: true });
                    projectStore.createIndex('name', 'name', { unique: true });
                }

                // 工作内容表（新增）：每个项目有自己的工作内容和单价
                if (!db.objectStoreNames.contains('workItems')) {
                    const wiStore = db.createObjectStore('workItems', { keyPath: 'id', autoIncrement: true });
                    wiStore.createIndex('projectName', 'projectName', { unique: false });
                    // 复合索引：项目名+内容名，确保同一项目下内容不重复
                    wiStore.createIndex('project_content', ['projectName', 'contentName'], { unique: true });
                }

                // 工人表
                if (!db.objectStoreNames.contains('workers')) {
                    const workerStore = db.createObjectStore('workers', { keyPath: 'id', autoIncrement: true });
                    workerStore.createIndex('name', 'name', { unique: true });
                }

                // 记账记录表
                if (!db.objectStoreNames.contains('records')) {
                    const recordStore = db.createObjectStore('records', { keyPath: 'id', autoIncrement: true });
                    recordStore.createIndex('date', 'date', { unique: false });
                    recordStore.createIndex('workerName', 'workerName', { unique: false });
                    recordStore.createIndex('workContent', 'workContent', { unique: false });
                    recordStore.createIndex('projectName', 'projectName', { unique: false });
                } else {
                    const recordStore = tx.objectStore('records');
                    if (!recordStore.indexNames.contains('projectName')) {
                        recordStore.createIndex('projectName', 'projectName', { unique: false });
                    }
                }
            };

            request.onsuccess = (e) => {
                this.db = e.target.result;
                resolve(this.db);
            };

            request.onerror = (e) => reject(e.target.error);
        });
    }

    // ---- 项目相关操作 ----

    async addProject(name) {
        return this._transaction('projects', 'readwrite', store => {
            return store.add({ name: name.trim(), createdAt: new Date().toISOString() });
        });
    }

    async getAllProjects() {
        return this._transaction('projects', 'readonly', store => store.getAll());
    }

    async deleteProject(id) {
        return this._transaction('projects', 'readwrite', store => store.delete(id));
    }

    async projectHasRecords(projectName) {
        const records = await this._transaction('records', 'readonly', store => {
            return store.index('projectName').getAll(projectName);
        });
        return records.length > 0;
    }

    // ---- 工作内容相关操作 ----

    // 添加工作内容（绑定到某个项目，含单价）
    async addWorkItem(projectName, contentName, unitPrice) {
        return this._transaction('workItems', 'readwrite', store => {
            return store.add({
                projectName: projectName,
                contentName: contentName.trim(),
                unitPrice: parseFloat(unitPrice),
                createdAt: new Date().toISOString()
            });
        });
    }

    // 获取某个项目下的所有工作内容
    async getWorkItemsByProject(projectName) {
        return this._transaction('workItems', 'readonly', store => {
            return store.index('projectName').getAll(projectName);
        });
    }

    // 获取所有工作内容
    async getAllWorkItems() {
        return this._transaction('workItems', 'readonly', store => store.getAll());
    }

    // 删除工作内容
    async deleteWorkItem(id) {
        return this._transaction('workItems', 'readwrite', store => store.delete(id));
    }

    // 更新工作内容单价
    async updateWorkItem(item) {
        return this._transaction('workItems', 'readwrite', store => store.put(item));
    }

    // ---- 工人相关操作 ----

    async addWorker(name) {
        return this._transaction('workers', 'readwrite', store => {
            return store.add({ name: name.trim(), createdAt: new Date().toISOString() });
        });
    }

    async getAllWorkers() {
        return this._transaction('workers', 'readonly', store => store.getAll());
    }

    async deleteWorker(id) {
        return this._transaction('workers', 'readwrite', store => store.delete(id));
    }

    async workerHasRecords(workerName) {
        const records = await this._transaction('records', 'readonly', store => {
            return store.index('workerName').getAll(workerName);
        });
        return records.length > 0;
    }

    // ---- 记账记录相关操作 ----

    async addRecord(record) {
        const now = new Date().toISOString();
        return this._transaction('records', 'readwrite', store => {
            return store.add({
                projectName: record.projectName || '',
                date: record.date,
                workerName: record.workerName,
                workContent: record.workContent,
                quantity: parseFloat(record.quantity),
                unitPrice: parseFloat(record.unitPrice),
                totalPrice: parseFloat(record.quantity) * parseFloat(record.unitPrice),
                createdAt: now,
                updatedAt: now
            });
        });
    }

    async updateRecord(record) {
        return this._transaction('records', 'readwrite', store => {
            return store.put({
                ...record,
                quantity: parseFloat(record.quantity),
                unitPrice: parseFloat(record.unitPrice),
                totalPrice: parseFloat(record.quantity) * parseFloat(record.unitPrice),
                updatedAt: new Date().toISOString()
            });
        });
    }

    async deleteRecord(id) {
        return this._transaction('records', 'readwrite', store => store.delete(id));
    }

    async getAllRecords() {
        return this._transaction('records', 'readonly', store => store.getAll());
    }

    async getFilteredRecords(filters = {}) {
        const allRecords = await this.getAllRecords();
        return allRecords.filter(r => {
            if (filters.projectName && r.projectName !== filters.projectName) return false;
            if (filters.startDate && r.date < filters.startDate) return false;
            if (filters.endDate && r.date > filters.endDate) return false;
            if (filters.workerName && r.workerName !== filters.workerName) return false;
            if (filters.workContent && !r.workContent.includes(filters.workContent)) return false;
            return true;
        }).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
    }

    async getStatsByWorker(startDate, endDate, projectName) {
        const filters = { startDate, endDate };
        if (projectName) filters.projectName = projectName;
        const records = await this.getFilteredRecords(filters);
        const stats = {};
        records.forEach(r => {
            if (!stats[r.workerName]) {
                stats[r.workerName] = { name: r.workerName, totalQty: 0, totalAmount: 0 };
            }
            stats[r.workerName].totalQty += r.quantity;
            stats[r.workerName].totalAmount += r.totalPrice;
        });
        return Object.values(stats).sort((a, b) => b.totalAmount - a.totalAmount);
    }

    async getStatsByContent(startDate, endDate, projectName) {
        const filters = { startDate, endDate };
        if (projectName) filters.projectName = projectName;
        const records = await this.getFilteredRecords(filters);
        const stats = {};
        records.forEach(r => {
            if (!stats[r.workContent]) {
                stats[r.workContent] = { content: r.workContent, totalQty: 0, totalAmount: 0 };
            }
            stats[r.workContent].totalQty += r.quantity;
            stats[r.workContent].totalAmount += r.totalPrice;
        });
        return Object.values(stats).sort((a, b) => b.totalAmount - a.totalAmount);
    }

    // 按工作内容×工人交叉统计
    async getStatsByContentWorker(startDate, endDate, projectName) {
        const filters = { startDate, endDate };
        if (projectName) filters.projectName = projectName;
        const records = await this.getFilteredRecords(filters);
        const stats = {};
        records.forEach(r => {
            if (!stats[r.workContent]) {
                stats[r.workContent] = { content: r.workContent, workers: {}, totalQty: 0, totalAmount: 0 };
            }
            const group = stats[r.workContent];
            group.totalQty += r.quantity;
            group.totalAmount += r.totalPrice;
            if (!group.workers[r.workerName]) {
                group.workers[r.workerName] = { name: r.workerName, qty: 0, amount: 0 };
            }
            group.workers[r.workerName].qty += r.quantity;
            group.workers[r.workerName].amount += r.totalPrice;
        });
        return Object.values(stats).sort((a, b) => b.totalAmount - a.totalAmount).map(g => ({
            ...g,
            workers: Object.values(g.workers).sort((a, b) => b.amount - a.amount)
        }));
    }

    async exportCSV(filters = {}) {
        const records = await this.getFilteredRecords(filters);
        const header = '项目,日期,工人姓名,工作内容,数量,单价,总价\n';
        const rows = records.map(r =>
            `${r.projectName || ''},${r.date},${r.workerName},${r.workContent},${r.quantity},${r.unitPrice},${r.totalPrice.toFixed(2)}`
        ).join('\n');
        const bom = '\uFEFF';
        const blob = new Blob([bom + header + rows], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `工资记录_${filters.projectName || '全部'}_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // ---- 内部辅助方法 ----
    _transaction(storeName, mode, callback) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, mode);
            const store = tx.objectStore(storeName);
            const request = callback(store);

            if (request instanceof IDBRequest) {
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            } else {
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            }
        });
    }
}

const db = new BookkeepingDB();
