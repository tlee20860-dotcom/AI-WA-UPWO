class State {
  constructor() {
    this.user = null;
    this.statuses = ['排產中', '印刷', '裁切', '品檢', '出貨'];
    this.navConfig = null; // 💡 新增：導覽選單配置
  }

  // ═══ 使用者相關 ═══
  setUser(user) {
    this.user = user;
    // 存入 sessionStorage 以便重新整理時保持登入狀態
    if (user) {
      sessionStorage.setItem('upgrade_user', JSON.stringify(user));
    } else {
      sessionStorage.removeItem('upgrade_user');
    }
  }

  getUser() {
    if (!this.user) {
      const stored = sessionStorage.getItem('upgrade_user');
      if (stored) {
        try {
          this.user = JSON.parse(stored);
        } catch (e) {
          this.user = null;
        }
      }
    }
    return this.user;
  }

  clearUser() {
    this.user = null;
    sessionStorage.removeItem('upgrade_user');
  }

  // ═══ 狀態相關 ═══
  setStatuses(statuses) {
    if (Array.isArray(statuses) && statuses.length > 0) {
      this.statuses = statuses;
    }
  }

  getStatuses() {
    return this.statuses;
  }

  // ═══ 導覽選單相關 ═══
  setNavConfig(config) {
    if (Array.isArray(config)) {
      this.navConfig = config;
    }
  }

  getNavConfig() {
    return this.navConfig;
  }
}

// 匯出單一實例 (Singleton)
export const AppState = new State();

/*
F: AI-WA-UPWO/src/config/state.js
V: 1793020000
W: UPGRADE-007
*/