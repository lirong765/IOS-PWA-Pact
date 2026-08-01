/**
 * 契约 Pact — App Logic
 * PWA habit tracker with self-reward system
 */

const App = (() => {
  'use strict';

  // ============ State ============
  const GOALS_KEY = 'pact_goals';
  const CHECKINS_KEY = 'pact_checkins';

  let state = {
    currentTab: 'dashboard',
    selectedRule: 'strict',
    photoData: null,          // base64 data URL of uploaded photo
    currentGoalFilter: 'active',
    activeModal: null,
    coachMessages: []
  };

  // ============ DOM Helpers ============
  const el = (id) => document.getElementById(id);
  const qs = (sel) => document.querySelector(sel);
  const qsa = (sel) => document.querySelectorAll(sel);

  // ============ Data Layer ============
  function loadGoals() {
    try {
      const raw = localStorage.getItem(GOALS_KEY);
      return raw ? JSON.parse(raw) : getDefaultGoals();
    } catch { return getDefaultGoals(); }
  }

  function saveGoals(goals) {
    localStorage.setItem(GOALS_KEY, JSON.stringify(goals));
  }

  function loadCheckins() {
    try {
      const raw = localStorage.getItem(CHECKINS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }

  function saveCheckins(checkins) {
    localStorage.setItem(CHECKINS_KEY, JSON.stringify(checkins));
  }

  function getDefaultGoals() {
    const now = new Date();
    const daysAgo = (d) => {
      const dt = new Date(now);
      dt.setDate(dt.getDate() - d);
      return dt.toISOString().split('T')[0];
    };
    return [
      { id:'g1', title:'每天跑步', targetDays:30, deadlineDays:60, completedDays:18, reward:'Nike Pegasus 跑鞋 · ¥1,499', rewardEmoji:'👟', status:'active', rule:'strict', startDate:daysAgo(30), photoUrl:null },
      { id:'g2', title:'每天阅读 30 分钟', targetDays:21, deadlineDays:30, completedDays:21, reward:'Kindle Scribe · ¥2,699', rewardEmoji:'📖', status:'completed', rule:'lenient', startDate:daysAgo(40), unlockDate:daysAgo(19), photoUrl:null },
      { id:'g3', title:'每天冥想 10 分钟', targetDays:14, deadlineDays:21, completedDays:5, reward:'冥想坐垫 + 线香套装', rewardEmoji:'🧘', status:'active', rule:'tiered', startDate:daysAgo(12), photoUrl:null },
      { id:'g4', title:'每天背 20 个单词', targetDays:30, deadlineDays:45, completedDays:4, reward:'AirPods Pro · ¥1,899', rewardEmoji:'🎧', status:'expired', rule:'strict', startDate:daysAgo(50), photoUrl:null },
    ];
  }

  // ============ Deadline Analysis ============
  function getDeadlineDate(goal) {
    const d = new Date(goal.startDate);
    d.setDate(d.getDate() + goal.deadlineDays);
    return d;
  }

  function getDaysUntilDeadline(goal) {
    return Math.ceil((getDeadlineDate(goal) - new Date()) / 86400000);
  }

  function getDeadlineUrgency(goal) {
    const rem = getDaysUntilDeadline(goal);
    const need = goal.targetDays - goal.completedDays;
    if (rem < 0) return 'over';
    if (rem < need || rem < need * 2) return 'tight';
    return 'safe';
  }

  function getDeadlineLabel(goal) {
    const urgency = getDeadlineUrgency(goal);
    const rem = getDaysUntilDeadline(goal);
    if (urgency === 'over') return { text: `⏰ 已过期 ${Math.abs(rem)} 天`, cls: 'deadline-over' };
    if (urgency === 'tight') return { text: `⚡ 仅剩 ${rem} 天`, cls: 'deadline-tight' };
    return { text: `📅 还剩 ${rem} 天`, cls: 'deadline-safe' };
  }

  function getDeadlinePct(goal) {
    const start = new Date(goal.startDate);
    const deadline = getDeadlineDate(goal);
    const total = deadline - start;
    const elapsed = Date.now() - start;
    return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
  }

  function analyzeGoal(goal) {
    const pct = Math.round((goal.completedDays / goal.targetDays) * 100);
    const now = new Date();
    const start = new Date(goal.startDate);
    const totalDuration = goal.deadlineDays;
    const elapsedDays = Math.floor((now - start) / 86400000);
    const dlPct = Math.min(100, Math.round((elapsedDays / totalDuration) * 100));
    const rem = getDaysUntilDeadline(goal);
    const need = goal.targetDays - goal.completedDays;
    const gap = pct - dlPct;

    let verdict;
    if (rem <= 0) verdict = '已过期';
    else if (gap >= 10) verdict = '进展领先';
    else if (gap <= -10) verdict = '进度落后';
    else verdict = '节奏正常';

    return {
      title: goal.title, reward: goal.reward,
      completedDays: goal.completedDays, targetDays: goal.targetDays,
      totalDuration, elapsedDays, pct, dlPct,
      rem: Math.max(0, rem), need, gap, verdict, status: goal.status
    };
  }

  // ============ Navigation ============
  function switchTab(tabName) {
    state.currentTab = tabName;
    closeModalSilent();

    // Toggle tab pages
    qsa('.tab-page').forEach(p => p.classList.remove('active'));
    const page = el('tab-' + tabName);
    if (page) page.classList.add('active');

    // Toggle tab bar
    qsa('#global-tab-bar .tab-item').forEach(b => b.classList.remove('active'));
    const btn = qs(`#global-tab-bar .tab-item[data-tab="${tabName}"]`);
    if (btn) btn.classList.add('active');

    // Render
    if (tabName === 'dashboard') renderDashboard();
    else if (tabName === 'rewards') renderRewards();
    else if (tabName === 'ai-coach') { state.coachMessages = []; renderCoach(); }
  }

  function openModal(modalName) {
    state.activeModal = modalName;
    const modal = el('modal-' + modalName);
    if (modal) {
      modal.classList.add('show');
      if (modalName === 'create') resetCreateForm();
    }
  }

  function closeModal(modalName) {
    const modal = el('modal-' + modalName);
    if (modal) modal.classList.remove('show');
    state.activeModal = null;
    if (modalName === 'create') {
      _unhighlightTabButton('create');
      // Restore the current tab highlight
      _highlightTabButton(state.currentTab);
    }
    if (modalName === 'detail' || modalName === 'create') {
      renderDashboard();
      renderRewards();
    }
  }

  function closeModalSilent() {
    if (state.activeModal) {
      if (state.activeModal === 'create') _unhighlightTabButton('create');
      el('modal-' + state.activeModal).classList.remove('show');
      state.activeModal = null;
    }
  }

  function _highlightTabButton(tab) {
    qsa('#global-tab-bar .tab-item').forEach(b => b.classList.remove('active'));
    const btn = qs(`#global-tab-bar .tab-item[data-tab="${tab}"]`);
    if (btn) btn.classList.add('active');
  }

  function _unhighlightTabButton(tab) {
    const btn = qs(`#global-tab-bar .tab-item[data-tab="${tab}"]`);
    if (btn) btn.classList.remove('active');
  }

  // ============ Template Helpers ============
  function badgeHtml(status) {
    const map = {
      active: '<span class="goal-status status-active">进行中</span>',
      completed: '<span class="goal-status status-completed">✅ 已解锁</span>',
      expired: '<span class="goal-status status-expired">⏰ 已过期</span>'
    };
    return map[status] || '';
  }

  function emptyStateHtml(filter) {
    const msgs = { active: ['📝', '还没有进行中的契约'], completed: ['🏆', '还没有完成的契约'], expired: ['🎉', '没有过期的契约，很好！'] };
    const [emoji, msg] = msgs[filter];
    return `<div class="card text-center" style="padding:32px">
      <div style="font-size:40px;margin-bottom:12px">${emoji}</div>
      <div style="font-size:15px;font-weight:600">${msg}</div>
    </div>`;
  }

  // Render reward image: real photo or emoji placeholder
  function rewardImgHtml(goal, size) {
    if (goal.photoData) {
      return `<img src="${goal.photoData}" alt="${goal.reward}" data-lightbox onclick="event.stopPropagation();App.openLightbox('${goal.photoData}')" style="width:100%;height:100%;object-fit:cover;border-radius:${size > 100 ? '16px' : '0'};">`;
    }
    return goal.rewardEmoji || '🎁';
  }

  function deadlineCls(urgency) {
    return urgency === 'over' ? 'over' : urgency === 'tight' ? 'tight' : 'safe';
  }

  function goalCardHtml(goal) {
    const pct = Math.round((goal.completedDays / goal.targetDays) * 100);
    const remaining = goal.targetDays - goal.completedDays;
    const dl = getDeadlineLabel(goal);
    const dlPct = getDeadlinePct(goal);
    const dlU = getDeadlineUrgency(goal);
    const dlCls = deadlineCls(dlU);
    const opacity = goal.status === 'expired' ? 'opacity:0.6' : '';
    const deadlineDate = getDeadlineDate(goal).toLocaleDateString('zh-CN');
    const isActive = goal.status === 'active';

    const progressFillClass = goal.status === 'completed' ? 'green' : goal.status === 'expired' ? 'gray' : 'blue';

    let bottom;
    if (isActive) {
      bottom = `
      <div class="dual-progress">
        <div>
          <div class="dual-progress-label"><span>打卡进度</span><strong>${pct}%</strong></div>
          <div class="progress-bar"><div class="progress-fill blue" style="width:${pct}%"></div></div>
        </div>
        <div>
          <div class="dual-progress-label"><span>时间消耗</span><strong>${dlPct}%</strong></div>
          <div class="deadline-bar"><div class="deadline-fill ${dlCls}" style="width:${dlPct}%"></div></div>
        </div>
      </div>
      <div class="flex-between" style="margin-top:4px">
        <span class="deadline-badge ${dl.cls}">${dl.text}</span>
        <span class="text-xs text-secondary">到期 ${deadlineDate}</span>
      </div>`;
    } else {
      const label = goal.status === 'completed' ? '✅ 期限内完成' : '❌ 未在期限内完成';
      bottom = `<div class="flex-between text-sm text-secondary" style="margin-top:4px">
        <span>${label}</span><span>到期 ${deadlineDate}</span>
      </div>`;
    }

    return `
    <div class="card goal-card" style="${opacity}" onclick="App.openDetailModal('${goal.id}')">
      <div class="goal-header">
        <div style="display:flex;gap:12px;flex:1;min-width:0">
          ${goal.photoData ? `<div style="width:48px;height:48px;border-radius:8px;overflow:hidden;flex-shrink:0;background:#f3f4f6"><img src="${goal.photoData}" style="width:100%;height:100%;object-fit:cover" alt="" data-lightbox onclick="event.stopPropagation();App.openLightbox('${goal.photoData}')"></div>` : ''}
          <div style="flex:1;min-width:0">
            <div class="goal-title" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${goal.title}</div>
            <div class="goal-reward" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">🎁 ${goal.reward}</div>
          </div>
        </div>
        ${badgeHtml(goal.status)}
      </div>
      <div class="progress-info">
        <span>已完成 <strong>${goal.completedDays}</strong> / ${goal.targetDays} 天</span>
        <span><strong>${pct}%</strong>${isActive ? ` · 还剩 ${remaining} 天` : ''}</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill ${progressFillClass}" style="width:${pct}%"></div>
      </div>
      ${bottom}
    </div>`;
  }

  // ============ Dashboard ============
  function renderDashboard() {
    const container = el('dashboard-content');
    if (!container) return;

    const goals = loadGoals();
    const todayStr = new Date().toISOString().split('T')[0];
    const checkins = loadCheckins();

    // Stats
    let totalC = 0, unlockedC = 0;
    goals.forEach(g => { totalC += g.completedDays; if (g.status === 'completed') unlockedC++; });

    // Streak
    let streak = 0;
    const cd = new Date();
    while (true) {
      const d = cd.toISOString().split('T')[0];
      if (Object.keys(checkins).some(k => k.startsWith(d))) { streak++; cd.setDate(cd.getDate() - 1); }
      else break;
    }

    const active = goals.filter(g => g.status === 'active');
    const completed = goals.filter(g => g.status === 'completed');
    const expired = goals.filter(g => g.status === 'expired');

    const groups = { active, completed, expired };
    const displayGoals = groups[state.currentGoalFilter] || active;

    let html = `
    <div class="stats-row">
      <div class="stat-card"><div class="stat-value">${totalC}</div><div class="stat-label">总打卡</div></div>
      <div class="stat-card"><div class="stat-value">${streak}</div><div class="stat-label">当前连续</div></div>
      <div class="stat-card"><div class="stat-value">${unlockedC}</div><div class="stat-label">已解锁</div></div>
    </div>
    <div class="flex-between text-sm" style="font-weight:600;color:var(--text-secondary);margin-bottom:10px">
      <span>我的目标</span>
      <span style="color:var(--accent)">📅 ${todayStr}</span>
    </div>
    <div class="segmented-control" id="goal-filter">
      <button class="seg-btn ${state.currentGoalFilter==='active'?'active':''}" onclick="App.filterGoals('active')">进行中 <span style="font-size:10px;opacity:0.7">${active.length}</span></button>
      <button class="seg-btn ${state.currentGoalFilter==='completed'?'active':''}" onclick="App.filterGoals('completed')">已完成 <span style="font-size:10px;opacity:0.7">${completed.length}</span></button>
      <button class="seg-btn ${state.currentGoalFilter==='expired'?'active':''}" onclick="App.filterGoals('expired')">已过期 <span style="font-size:10px;opacity:0.7">${expired.length}</span></button>
    </div>`;

    if (displayGoals.length === 0) {
      html += emptyStateHtml(state.currentGoalFilter);
    } else {
      html += displayGoals.map(goalCardHtml).join('');
    }

    container.innerHTML = html;
    _renderBackupPanel();
  }

  function filterGoals(category) {
    state.currentGoalFilter = category;
    renderDashboard();
  }

  // ============ Rewards Gallery ============
  function renderRewards() {
    const container = el('rewards-content');
    if (!container) return;

    const goals = loadGoals();
    const unlocked = goals.filter(g => g.status === 'completed');
    const locked = goals.filter(g => g.status === 'active');
    const expired = goals.filter(g => g.status === 'expired');

    function rewardCard(g, lockedOverlay) {
      const overlayHtml = lockedOverlay
        ? `<div class="reward-lock-overlay">${lockedOverlay}</div>`
        : '';
      const isExpired = lockedOverlay === '❌';
      const isLocked = lockedOverlay === '🔒';
      const imgStyle = isExpired ? 'filter:grayscale(1)' : '';
      const itemClass = isLocked ? ' locked' : '';
      const itemStyle = isExpired ? 'opacity:0.5' : '';
      const imgContent = g.photoData
        ? `<img src="${g.photoData}" alt="${g.reward}" style="width:100%;height:100%;object-fit:cover;${imgStyle}">`
        : g.rewardEmoji || '🎁';
      return `
      <div class="reward-item${itemClass}" style="position:relative;${itemStyle}">
        <div class="reward-item-img">${imgContent}</div>
        ${overlayHtml}
        <div class="reward-item-info">
          <div class="reward-item-title">${g.reward}</div>
          <div class="reward-item-date">${g.title} · ${g.unlockDate || ''}</div>
        </div>
      </div>`;
    }

    let html = '<div class="section-title">✅ 已解锁</div>';
    if (unlocked.length === 0) {
      html += '<div class="text-secondary text-sm" style="padding:12px">还没有解锁的奖励，加油！</div>';
    }
    html += '<div class="reward-grid">';
    html += unlocked.map(g => rewardCard(g, null)).join('');
    html += '</div>';

    html += '<div class="section-title" style="margin-top:24px">🔒 进行中</div>';
    html += '<div class="reward-grid">';
    html += locked.map(g => {
      const pct = Math.round((g.completedDays / g.targetDays) * 100);
      const dl = getDeadlineLabel(g);
      // Override the date line with progress info
      const g2 = { ...g, unlockDate: `进度 ${pct}% · ${dl.text}` };
      return rewardCard(g2, '🔒');
    }).join('');
    html += expired.map(g => {
      const pct = Math.round((g.completedDays / g.targetDays) * 100);
      const g2 = { ...g, unlockDate: `仅完成 ${pct}% · 已过期` };
      return rewardCard(g2, '❌');
    }).join('');
    html += '</div>';

    container.innerHTML = html;
  }

  // ============ Goal Detail ============
  function openDetailModal(goalId) {
    const goals = loadGoals();
    const goal = goals.find(g => g.id === goalId);
    if (!goal) return;

    el('detail-title').textContent = goal.title;

    const pct = Math.round((goal.completedDays / goal.targetDays) * 100);
    const remaining = goal.targetDays - goal.completedDays;
    const todayStr = new Date().toISOString().split('T')[0];
    const checkins = loadCheckins();
    const dl = getDeadlineLabel(goal);
    const dlPct = getDeadlinePct(goal);
    const dlU = getDeadlineUrgency(goal);
    const deadlineDate = getDeadlineDate(goal);
    const daysUntilDeadline = getDaysUntilDeadline(goal);
    const isCheckedToday = checkins[todayStr + '_' + goalId];
    const ruleLabel = goal.rule === 'strict' ? '严格模式' : goal.rule === 'lenient' ? '宽容模式' : '阶梯模式';

    let html;
    if (goal.status === 'completed') {
      html = `
      <div class="card celebration">
        <div class="celebration-emoji">🎉</div>
        <div class="celebration-title">你做到了！</div>
        <div class="celebration-desc">在 ${goal.deadlineDays} 天期限内完成了 ${goal.completedDays} 天打卡<br>你可以兑现奖励了</div>
        <div class="reward-img-placeholder" style="${goal.photoData ? 'background:none;overflow:hidden;width:240px;height:240px;cursor:pointer' : ''}">${rewardImgHtml(goal, 240)}</div>
        ${goal.photoData ? `<div style="text-align:center;margin-top:6px;display:flex;gap:8px;justify-content:center"><input type="file" id="replace-photo-${goal.id}" accept="image/*" style="display:none" onchange="App.replaceGoalPhoto(event,'${goal.id}')"><button style="border:none;background:none;color:var(--accent);font-size:12px;cursor:pointer;font-family:inherit" onclick="document.getElementById('replace-photo-${goal.id}').click()">🔄 更换照片</button><button style="border:none;background:none;color:var(--danger);font-size:12px;cursor:pointer;font-family:inherit" onclick="App.removeGoalPhoto('${goal.id}')">移除照片</button></div>` : ''}
        <div style="font-size:18px;font-weight:700">${goal.reward}</div>
        <div class="text-sm text-secondary mt-8">解锁日期：${goal.unlockDate || '刚刚'} · ${ruleLabel}</div>
        <button class="btn-primary" style="margin-top:16px;background:var(--danger)" onclick="App.deleteGoal('${goal.id}')">🗑️ 删除此契约</button>
      </div>`;
    } else if (goal.status === 'expired') {
      html = `
      <div class="card text-center" style="padding:24px">
        <div style="font-size:48px;margin-bottom:12px">⏰</div>
        <div style="font-size:18px;font-weight:700">契约已过期</div>
        <div class="text-sm text-secondary mt-8">在 ${goal.deadlineDays} 天期限内只完成了 ${goal.completedDays}/${goal.targetDays} 天<br>到期日：${deadlineDate.toLocaleDateString('zh-CN')} · 已过期 ${Math.abs(daysUntilDeadline)} 天</div>
        <div class="mt-16"><div class="progress-bar"><div class="progress-fill gray" style="width:${pct}%"></div></div></div>
      </div>
      <div class="card">
        <div class="flex-between" style="margin-bottom:10px"><div class="section-title" style="margin:0">🎁 奖励</div><span class="text-xs" style="color:#9ca3af">已失效</span></div>
        <div style="font-size:28px;text-align:center;margin:8px 0;opacity:0.5">${goal.photoData ? `<img src="${goal.photoData}" style="max-width:240px;max-height:240px;border-radius:12px;opacity:0.5;cursor:pointer" data-lightbox onclick="event.stopPropagation();App.openLightbox('${goal.photoData}')" alt="${goal.reward}">` : goal.rewardEmoji || '🎁'}</div>
        <div style="font-size:15px;font-weight:600;text-align:center;opacity:0.5">${goal.reward}</div>
        ${goal.photoData ? `<div style="text-align:center;margin-top:6px;display:flex;gap:8px;justify-content:center"><input type="file" id="replace-photo-${goal.id}" accept="image/*" style="display:none" onchange="App.replaceGoalPhoto(event,'${goal.id}')"><button style="border:none;background:none;color:var(--accent);font-size:12px;cursor:pointer;font-family:inherit" onclick="document.getElementById('replace-photo-${goal.id}').click()">🔄 更换照片</button><button style="border:none;background:none;color:var(--danger);font-size:12px;cursor:pointer;font-family:inherit" onclick="App.removeGoalPhoto('${goal.id}')">移除照片</button></div>` : ''}
        <button class="btn-primary" style="margin-top:12px;background:var(--danger)" onclick="App.deleteGoal('${goal.id}')">🗑️ 删除此契约</button>
      </div>`;
    } else {
      const urgencyHtml = dlU === 'tight'
        ? `<div class="urgency-alert">⚠️ 时间紧迫！剩余 ${daysUntilDeadline} 天还需打卡 ${remaining} 天，每天都不能松懈</div>`
        : '';
      html = `
      ${urgencyHtml}
      <div class="card">
        <div class="flex-between" style="margin-bottom:12px">
          <div><div style="font-size:15px;font-weight:600">今日打卡</div><div class="text-sm text-secondary">${todayStr} · ${ruleLabel}</div></div>
          <span class="goal-status status-active">${pct}%</span>
        </div>
        <button class="checkin-btn ${isCheckedToday ? 'done' : 'today'}" ${isCheckedToday ? '' : `onclick="App.doCheckin('${goal.id}')"`}>
          ${isCheckedToday ? '✅ 今日已完成' : '☑️ 打卡'}
        </button>
      </div>
      <div class="card">
        <div class="progress-info"><span>打卡进度 <strong>${goal.completedDays}</strong> / ${goal.targetDays} 天</span><span>还剩 <strong>${remaining}</strong> 天</span></div>
        <div class="progress-bar"><div class="progress-fill blue" style="width:${pct}%"></div></div>
        <div class="mt-12" style="padding-top:12px;border-top:1px solid var(--border)">
          <div class="progress-info"><span>时间消耗</span><span><strong>${dlPct}%</strong> · ${dl.text}</span></div>
          <div class="deadline-bar"><div class="deadline-fill ${dlU === 'over' ? 'over' : dlU === 'tight' ? 'tight' : 'safe'}" style="width:${dlPct}%"></div></div>
        </div>
        <div class="flex-between mt-12 text-sm text-secondary"><span>开始：${goal.startDate}</span><span>到期：${deadlineDate.toLocaleDateString('zh-CN')}</span></div>
      </div>
      <div class="card">
        <div class="flex-between" style="margin-bottom:10px"><div class="section-title" style="margin:0">🎁 奖励</div><span class="text-xs" style="color:var(--danger)">🔒 创建后锁定</span></div>
        <div style="font-size:28px;text-align:center;margin:8px 0">${goal.photoData ? `<img src="${goal.photoData}" style="max-width:240px;max-height:240px;border-radius:12px;cursor:pointer" data-lightbox onclick="event.stopPropagation();App.openLightbox('${goal.photoData}')" alt="${goal.reward}">` : goal.rewardEmoji || '🎁'}</div>
        <div style="font-size:15px;font-weight:600;text-align:center">${goal.reward}</div>
        ${goal.photoData ? `<div style="text-align:center;margin-top:6px;display:flex;gap:8px;justify-content:center"><input type="file" id="replace-photo-${goal.id}" accept="image/*" style="display:none" onchange="App.replaceGoalPhoto(event,'${goal.id}')"><button style="border:none;background:none;color:var(--accent);font-size:12px;cursor:pointer;font-family:inherit" onclick="document.getElementById('replace-photo-${goal.id}').click()">🔄 更换照片</button><button style="border:none;background:none;color:var(--danger);font-size:12px;cursor:pointer;font-family:inherit" onclick="App.removeGoalPhoto('${goal.id}')">移除照片</button></div>` : ''}
        <button class="btn-primary" style="margin-top:16px;background:var(--danger)" onclick="App.deleteGoal('${goal.id}')">🗑️ 删除此契约</button>
      </div>`;
    }

    el('detail-content').innerHTML = html;
    openModal('detail');
  }

  function doCheckin(goalId) {
    const goals = loadGoals();
    const goal = goals.find(g => g.id === goalId);
    if (!goal) return;

    const todayStr = new Date().toISOString().split('T')[0];
    const checkins = loadCheckins();
    checkins[todayStr + '_' + goalId] = true;
    saveCheckins(checkins);
    goal.completedDays++;

    if (goal.completedDays >= goal.targetDays) {
      goal.status = 'completed';
      goal.unlockDate = todayStr;
    }
    saveGoals(goals);

    openDetailModal(goalId);
    showToast('✅ 打卡成功！');
    if (goal.status === 'completed') {
      setTimeout(() => showToast('🎉 恭喜！期限内达成目标！'), 1500);
    }
  }

  // ============ Create Goal ============
  function openCreateModal() {
    // Don't reset if form already has content — preserve user's work
    openModal('create');
    _highlightTabButton('create');
  }

  function resetCreateForm() {
    el('form-title').value = '';
    el('form-reward').value = '';
    el('form-days').value = '30';
    el('form-deadline').value = '60';
    el('photo-input').value = '';
    state.selectedRule = 'strict';
    state.photoData = null;

    qsa('.rule-option').forEach(el => el.classList.remove('selected'));
    el('rule-strict').classList.add('selected');

    const upload = el('photo-upload');
    upload.classList.remove('has-photo');
    upload.innerHTML = '<span style="font-size:32px">📷</span><span>点击上传奖励照片</span>';
  }

  function selectRule(rule) {
    state.selectedRule = rule;
    qsa('.rule-option').forEach(el => el.classList.remove('selected'));
    el('rule-' + rule).classList.add('selected');
  }

  function handlePhotoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      // Resize image before storing to save space
      const img = new Image();
      img.onload = () => {
        const maxW = 400;
        const scale = Math.min(1, maxW / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);

        // Auto-compress to under 300KB
        let quality = 0.8;
        let result;
        do {
          result = canvas.toDataURL('image/jpeg', quality);
          quality -= 0.1;
        } while (result.length > 300 * 1024 && quality > 0.1);

        state.photoData = result;

        // Show preview
        const upload = el('photo-upload');
        upload.classList.add('has-photo');
        upload.innerHTML = `
          <img src="${state.photoData}" alt="奖励照片预览" data-lightbox onclick="event.stopPropagation();App.openLightbox('${state.photoData}')">
          <button class="photo-remove" onclick="event.stopPropagation();App.removePhoto()">✕</button>
        `;
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function removePhoto() {
    state.photoData = null;
    el('photo-input').value = '';
    const upload = el('photo-upload');
    upload.classList.remove('has-photo');
    upload.innerHTML = '<span style="font-size:32px">📷</span><span>点击上传奖励照片</span>';
  }

  function removeGoalPhoto(goalId) {
    const goals = loadGoals();
    const goal = goals.find(g => g.id === goalId);
    if (!goal || !goal.photoData) return;
    goal.photoData = null;
    saveGoals(goals);
    openDetailModal(goalId);
    showToast('照片已移除');
  }

  function replaceGoalPhoto(event, goalId) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const maxW = 400;
        const scale = Math.min(1, maxW / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);

        // Auto-compress to under 300KB
        let quality = 0.8;
        let result;
        do {
          result = canvas.toDataURL('image/jpeg', quality);
          quality -= 0.1;
        } while (result.length > 300 * 1024 && quality > 0.1);

        const goals = loadGoals();
        const goal = goals.find(g => g.id === goalId);
        if (goal) {
          goal.photoData = result;
          saveGoals(goals);
          openDetailModal(goalId);
          showToast('✅ 照片已更新');
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function deleteGoal(goalId) {
    const goals = loadGoals();
    const goal = goals.find(g => g.id === goalId);
    if (!goal) return;

    if (!confirm(`确定删除「${goal.title}」吗？\n此操作不可撤销。`)) return;

    const newGoals = goals.filter(g => g.id !== goalId);
    saveGoals(newGoals);

    // Clean up associated checkins
    const checkins = loadCheckins();
    Object.keys(checkins).forEach(k => {
      if (k.endsWith('_' + goalId)) delete checkins[k];
    });
    saveCheckins(checkins);

    closeModal('detail');
    showToast('🗑️ 已删除');
  }

  function getMinDeadlineDays(targetDays, rule) {
    switch (rule) {
      case 'strict':
        return targetDays; // No rest days: need exactly N days
      case 'lenient':
      case 'tiered':
        // 2 rest days per week → 5 working days per week
        // targetDays ÷ 5 × 7 = minimum deadline days
        return Math.ceil(targetDays / 5 * 7);
      default:
        return targetDays;
    }
  }

  function createGoal() {
    const title = el('form-title').value.trim();
    const targetDays = parseInt(el('form-days').value) || 30;
    const deadlineDays = parseInt(el('form-deadline').value) || 60;
    const reward = el('form-reward').value.trim();
    const rule = state.selectedRule;
    const ruleLabel = rule === 'strict' ? '严格模式' : rule === 'lenient' ? '宽容模式' : '阶梯模式';

    if (!title) { showToast('请填写目标名称'); return; }
    if (!reward) { showToast('请填写奖励'); return; }

    const minDeadline = getMinDeadlineDays(targetDays, rule);
    if (deadlineDays < minDeadline) {
      if (rule === 'strict') {
        showToast('有效期限不能少于目标天数');
      } else {
        showToast(`${ruleLabel}下，${targetDays}天目标至少需要${minDeadline}天期限（含每周休息日）`);
      }
      return;
    }

    const goals = loadGoals();
    goals.unshift({
      id: 'g' + Date.now(),
      title, targetDays, deadlineDays, completedDays: 0, reward,
      rewardEmoji: '🎁', status: 'active', rule: state.selectedRule,
      startDate: new Date().toISOString().split('T')[0],
      photoData: state.photoData || null,
    });
    saveGoals(goals);

    showToast('📝 契约已立下！');
    resetCreateForm();
    closeModal('create');
  }

  // ============ AI Coach ============
  function renderCoach() {
    const container = el('coach-content');
    if (!container) return;

    const goals = loadGoals();

    if (state.coachMessages.length === 0) {
      state.coachMessages.push({ role: 'ai', text: generateGreeting(goals) });
    }

    const topHtml = buildTodayBanner(goals);
    const chatHtml = state.coachMessages.map(m =>
      `<div class="chat-msg ${m.role}">${m.text}</div>`
    ).join('');

    container.innerHTML = topHtml + `<div class="chat-container" id="chat-container">${chatHtml}</div>`;

    requestAnimationFrame(() => {
      const ct = el('chat-container');
      if (ct) ct.scrollTop = ct.scrollHeight;
    });
  }

  function buildTodayBanner(goals) {
    const active = goals.filter(g => g.status === 'active');
    if (active.length === 0) return '';

    const todayStr = new Date().toISOString().split('T')[0];
    const checkins = loadCheckins();
    let checked = 0;
    active.forEach(g => { if (checkins[todayStr + '_' + g.id]) checked++; });

    if (checked === 0) {
      return `<div class="card" style="background:#fefce8;border:1px solid #fde68a;margin-bottom:12px;font-size:13px">☀️ 今天还没打卡，趁现在有空来一下？</div>`;
    }
    if (checked === active.length) {
      return `<div class="card" style="background:#f0fdf4;border:1px solid #bbf7d0;margin-bottom:12px;font-size:13px">✅ 今天全部完成，说到做到。</div>`;
    }
    return `<div class="card" style="background:#f0fdf4;border:1px solid #bbf7d0;margin-bottom:12px;font-size:13px">👍 完成 ${checked} 个，还有 ${active.length - checked} 个。</div>`;
  }

  function generateGreeting(goals) {
    const active = goals.filter(g => g.status === 'active');
    const completed = goals.filter(g => g.status === 'completed');
    const hour = new Date().getHours();
    const hi = hour < 10 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好';

    if (active.length === 0) {
      return `${hi}。你现在没有进行中的契约，去立一个吧。`;
    }

    const lines = [`${hi}。帮你看了一下数据：`];

    active.forEach(g => {
      const a = analyzeGoal(g);
      if (a.verdict === '已过期') {
        lines.push(`• <strong>${a.title}</strong>：打卡 ${a.completedDays}/${a.targetDays}（${a.pct}%），已过期 → 建议重设`);
      } else if (a.verdict === '进展领先') {
        lines.push(`• <strong>${a.title}</strong>：打卡 ${a.completedDays}/${a.targetDays}（${a.pct}%），时间消耗 ${a.elapsedDays}/${a.totalDuration}天（${a.dlPct}%）→ 领先 ${a.gap}%，节奏不错`);
      } else if (a.verdict === '进度落后') {
        lines.push(`• <strong>${a.title}</strong>：打卡 ${a.completedDays}/${a.targetDays}（${a.pct}%），时间消耗 ${a.elapsedDays}/${a.totalDuration}天（${a.dlPct}%）→ 落后 ${Math.abs(a.gap)}%，剩 ${a.rem} 天需打卡 ${a.need} 天`);
      } else {
        lines.push(`• <strong>${a.title}</strong>：打卡 ${a.completedDays}/${a.targetDays}（${a.pct}%），时间消耗 ${a.elapsedDays}/${a.totalDuration}天（${a.dlPct}%）→ 刚好，能按时完成`);
      }
    });

    const behind = active.filter(g => analyzeGoal(g).verdict === '进度落后');
    const ahead = active.filter(g => analyzeGoal(g).verdict === '进展领先');

    if (behind.length > 0) {
      lines.push(`<br>总的来说，<strong>${behind.map(g => '「' + g.title + '」').join('、')}</strong>需要多关注一下。要不要调整目标或者聊聊怎么回事？`);
    } else if (ahead.length === active.length) {
      lines.push('<br>所有目标都领先于时间线，保持这个节奏就行。');
    } else {
      lines.push('<br>总体节奏正常。有什么想聊的具体目标吗？');
    }

    if (completed.length > 0) {
      lines.push(`（你已经解锁过 ${completed.length} 个奖励了 👍）`);
    }

    return lines.join('<br>');
  }

  function sendChat() {
    const input = el('chat-input');
    const msg = input.value.trim();
    if (!msg) return;
    input.value = '';

    state.coachMessages.push({ role: 'user', text: msg });
    renderCoach();

    setTimeout(() => {
      const reply = generateReply(msg);
      state.coachMessages.push({ role: 'ai', text: reply });
      renderCoach();
    }, 500 + Math.random() * 500);
  }

  function generateReply(msg) {
    const goals = loadGoals();
    const active = goals.filter(g => g.status === 'active');

    // Specific goal analysis
    for (const g of active) {
      if (msg.includes(g.title)) {
        const a = analyzeGoal(g);
        if (a.verdict === '已过期') {
          return `「${g.title}」数据分析：<br><br>• 目标：打卡 ${a.targetDays} 天<br>• 结果：完成 ${a.completedDays}/${a.targetDays}（${a.pct}%）<br>• 时间已到<br><br>建议缩短到 ${Math.round(g.targetDays * 0.6)} 天重新立一个。`;
        }
        return `「${g.title}」数据分析：<br><br>📊 打卡进度：${a.completedDays}天完成 / ${a.targetDays}天目标 → <strong>${a.pct}%</strong><br>⏳ 时间消耗：${a.elapsedDays}天已过 / ${a.totalDuration}天期限 → <strong>${a.dlPct}%</strong><br>📐 差距：${a.pct}% - ${a.dlPct}% = <strong>${a.gap > 0 ? '+' + a.gap : a.gap}%</strong><br>📅 剩余：${a.rem}天 / 还需打卡 ${a.need}天<br><br>结论：<strong>${a.verdict}</strong><br>${a.verdict === '进展领先' ? `进展比时间快，按这速度能在到期前约 ${Math.max(0, a.rem - a.need)} 天完成。` : a.verdict === '进度落后' ? `剩余时间里每 ${Math.max(1, Math.round(a.rem / a.need))} 天需打卡 1 次，需要抓紧。` : '保持这个节奏就能按时完成。'}`;
      }
    }

    // Fatigue / give up
    if (/[累不想没动力放弃懒]/.test(msg)) {
      const best = active.reduce((a, b) => (a.completedDays / a.targetDays > b.completedDays / b.targetDays ? a : b), active[0]);
      if (best && best.completedDays >= 5) {
        const a = analyzeGoal(best);
        return `理解。但我帮你看了下数据：<br><br>做得最好的「${best.title}」：已坚持 ${best.completedDays} 天，打卡进度 ${a.pct}%，时间过了 ${a.elapsedDays}/${a.totalDuration} 天。${best.completedDays >= best.targetDays / 2 ? '已经过半了' : '最难的开头已经过了'}<br><br>今天实在不想做全部的话，就做 2 分钟版本。做了就算赢。`;
      }
      return '有时候就是不想动。没关系。试试只做 2 分钟——不是为了完成目标，就是让习惯别断。';
    }

    // Broken streak / failure
    if (/[断没做到失败崩溃忘了]/.test(msg)) {
      const expired = goals.filter(g => g.status === 'expired');
      if (expired.length > 0) {
        const e = expired[0];
        const pct = Math.round((e.completedDays / e.targetDays) * 100);
        return `分析一下「${e.title}」：<br><br>• 目标 ${e.targetDays} 天，期限 ${e.deadlineDays} 天<br>• 实际完成 ${e.completedDays} 天（${pct}%）<br>• 差 ${e.targetDays - e.completedDays} 天就到目标<br><br>其实完成度不低。建议这次重立一个，目标降到 ${Math.round(e.targetDays * 0.6)} 天。不用一步到位。`;
      }
      return '断了没关系。重点是别因为断了就全盘放弃。<br><br>看看你现在还有哪些目标在期限内——先把还在跑的马骑好。';
    }

    // Progress inquiry
    if (/[进步变化效果有用]/.test(msg) && active.length > 0) {
      const lines = ['帮你算了一下变化：'];
      active.forEach(g => {
        const a = analyzeGoal(g);
        const pace = a.elapsedDays > 0 ? Math.round(a.elapsedDays / Math.max(1, g.completedDays)) : 0;
        lines.push(`• 「${g.title}」：${g.completedDays} 天前是 0，现在已经打卡 ${g.completedDays} 天（${a.pct}%）。平均每 ${pace} 天打卡 1 次。`);
      });
      lines.push('<br>进步不是某一天的事，是每一天攒出来的。');
      return lines.join('<br>');
    }

    // Reward inquiry
    if (/[奖励买想要还差]/.test(msg) && active.length > 0) {
      const lines = ['你的奖励进度：'];
      active.forEach(g => {
        const a = analyzeGoal(g);
        if (a.verdict === '已过期') lines.push(`• 「${g.reward}」：已失效（完成 ${a.pct}%）`);
        else lines.push(`• 「${g.reward}」：还需 ${a.need} 天→ 预计 ${a.need} 天后可解锁`);
      });
      return lines.join('<br>');
    }

    // Default overview
    if (active.length === 0) {
      return '现在没有进行中的契约。想立一个吗？定个目标，绑个你想要的奖励。';
    }

    const lines = ['好的，帮你快速过一遍目前的情况：'];
    active.forEach(g => {
      const a = analyzeGoal(g);
      const emoji = a.verdict === '进展领先' ? '✅' : a.verdict === '进度落后' ? '⚠️' : a.verdict === '已过期' ? '❌' : '➖';
      lines.push(`• ${emoji} ${a.title}：${a.completedDays}/${a.targetDays}（${a.pct}%）| 时间 ${a.elapsedDays}/${a.totalDuration}天（${a.dlPct}%）→ ${a.verdict}`);
    });
    lines.push('<br>想深入了解哪个目标？直接告诉我就行。');
    return lines.join('<br>');
  }

  // ============ Backup / Restore ============
  let backupVisible = false;

  function toggleBackup() {
    backupVisible = !backupVisible;
    _renderBackupPanel();
  }

  function _renderBackupPanel() {
    const container = el('dashboard-content');
    // Remove existing backup panel if any
    const oldPanel = container.querySelector('.backup-panel');
    if (oldPanel) oldPanel.remove();

    if (!backupVisible) return;

    const panel = document.createElement('div');
    panel.className = 'card backup-panel';
    panel.innerHTML = `
      <div class="flex-between" style="margin-bottom:10px">
        <span style="font-size:14px;font-weight:600">📦 数据备份</span>
        <span style="font-size:12px;color:var(--text-secondary);cursor:pointer" onclick="App.toggleBackup()">✕</span>
      </div>
      <div style="font-size:13px;color:var(--text-secondary);margin-bottom:12px">
        备份包含所有目标、打卡记录和照片。建议定期导出到文件 App 保存。
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <button class="btn-primary" style="font-size:14px;padding:10px" onclick="App.exportData()">📤 导出备份</button>
        <button class="btn-primary" style="font-size:14px;padding:10px;background:var(--card);color:var(--text);border:1px solid var(--border)" onclick="document.getElementById('import-file').click()">📥 导入恢复</button>
      </div>
      <input type="file" id="import-file" accept=".json" style="display:none" onchange="App.importData(event)">
      <div id="backup-msg" style="font-size:12px;margin-top:8px;text-align:center;"></div>
      <div style="text-align:center;margin-top:10px;display:flex;align-items:center;justify-content:center;gap:12px">
        <span style="font-size:10px;color:#d1d5db">契约 v2.7</span>
        <button style="font-size:10px;background:none;border:1px solid var(--border);color:var(--text-secondary);padding:3px 10px;border-radius:10px;cursor:pointer;font-family:inherit" onclick="App.checkUpdate()">🔄 检查更新</button>
      </div>
    `;
    container.insertBefore(panel, container.firstChild);
  }

  function _buildBackup() {
    return {
      exportedAt: new Date().toISOString(),
      version: 1,
      goals: loadGoals(),
      checkins: loadCheckins()
    };
  }

  function exportData() {
    const backup = _buildBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pact_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    el('backup-msg').innerHTML = '<span style="color:var(--success)">✅ 备份已下载</span>';
  }

  function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.goals || !data.checkins || data.version !== 1) {
          throw new Error('不是有效的契约备份文件');
        }

        const currentGoals = loadGoals();
        const currentCheckins = loadCheckins();
        const existingIds = new Set(currentGoals.map(g => g.id));

        // Merge: new goals prepended, existing goals updated if same id
        const importedGoals = data.goals || [];
        const mergedGoals = [...importedGoals];
        currentGoals.forEach(g => {
          if (!mergedGoals.some(ig => ig.id === g.id)) {
            mergedGoals.push(g);
          }
        });

        // Merge checkins: imported takes priority over current
        const mergedCheckins = { ...currentCheckins, ...(data.checkins || {}) };

        if (!confirm(`即将导入 ${importedGoals.length} 个目标 和 ${Object.keys(data.checkins || {}).length} 条打卡记录。\n当前数据将被合并（同名目标以导入为准）。\n\n确认导入？`)) {
          el('import-file').value = '';
          return;
        }

        saveGoals(mergedGoals);
        saveCheckins(mergedCheckins);
        renderDashboard();
        renderRewards();
        el('backup-msg').innerHTML = '<span style="color:var(--success)">✅ 导入成功！</span>';
      } catch (err) {
        el('backup-msg').innerHTML = `<span style="color:var(--danger)">❌ ${err.message}</span>`;
      }
      el('import-file').value = '';
    };
    reader.readAsText(file);
  }

  // ============ Service Worker Update ============
  let _waitingSW = null;

  function _registerSWUpdate() {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.ready.then((reg) => {
      // Check for updates every time the app loads
      reg.update();

      // If a waiting SW was already found, show banner
      if (reg.waiting) {
        _waitingSW = reg.waiting;
        _showUpdateBanner();
      }

      // Listen for new SW entering waiting state
      reg.addEventListener('updatefound', () => {
        const newSW = reg.installing;
        if (!newSW) return;
        newSW.addEventListener('statechange', () => {
          if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
            _waitingSW = newSW;
            _showUpdateBanner();
          }
        });
      });
    });

    // Listen for content-updated messages from SW (background fetch detected new version)
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.action === 'content-updated') {
        _showUpdateBanner();
      }
    });

    // Also catch when controller changes (update applied)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    });
  }

  function _showUpdateBanner() {
    // Check if banner already exists
    if (document.getElementById('update-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'update-banner';
    banner.style.cssText = `
      position: fixed; bottom: calc(80px + env(safe-area-inset-bottom, 0px));
      left: 16px; right: 16px;
      background: #1a1a2e; color: white;
      border-radius: 12px; padding: 14px 18px;
      display: flex; align-items: center; justify-content: space-between;
      gap: 12px; z-index: 200;
      font-size: 14px; font-weight: 500;
      box-shadow: 0 8px 24px rgba(0,0,0,0.25);
      animation: slideUp 0.3s ease;
    `;
    banner.innerHTML = `
      <span>🔄 新版本可用</span>
      <button id="update-now-btn" style="
        background: white; color: #1a1a2e; border: none;
        padding: 8px 18px; border-radius: 20px;
        font-weight: 600; font-size: 13px; cursor: pointer;
        font-family: inherit; white-space: nowrap;
        -webkit-tap-highlight-color: transparent;
      ">立即更新</button>
    `;
    document.body.appendChild(banner);

    // Add slide-up animation
    const style = document.createElement('style');
    style.textContent = '@keyframes slideUp { from{transform:translateY(40px);opacity:0} to{transform:translateY(0);opacity:1} }';
    document.head.appendChild(style);

    document.getElementById('update-now-btn').addEventListener('click', () => {
      _applyUpdate();
    });
  }

  function checkUpdate() {
    if (!('serviceWorker' in navigator)) {
      showToast('当前浏览器不支持');
      return;
    }

    const msgEl = el('backup-msg');
    if (msgEl) msgEl.innerHTML = '<span style="color:var(--text-secondary)">⏳ 正在检查更新...</span>';

    navigator.serviceWorker.ready.then((reg) => {
      // Reset the notification flag so SW will re-check
      if (reg.waiting) {
        _waitingSW = reg.waiting;
        _showUpdateBanner();
        if (msgEl) msgEl.innerHTML = '<span style="color:var(--accent)">🔄 发现新版本！</span>';
        return;
      }

      // Check for SW script changes
      return reg.update().then(() => {
        // Give it a moment for the SW to install
        setTimeout(() => {
          if (reg.waiting) {
            _waitingSW = reg.waiting;
            _showUpdateBanner();
            if (msgEl) msgEl.innerHTML = '<span style="color:var(--accent)">🔄 发现新版本！</span>';
          } else if (reg.installing) {
            reg.installing.addEventListener('statechange', function onState() {
              if (this.state === 'installed') {
                _waitingSW = this;
                _showUpdateBanner();
                if (msgEl) msgEl.innerHTML = '<span style="color:var(--accent)">🔄 发现新版本！</span>';
              }
            });
          } else {
            if (msgEl) msgEl.innerHTML = '<span style="color:var(--success)">✅ 已是最新版本</span>';
            setTimeout(() => { if (msgEl) msgEl.innerHTML = ''; }, 2000);
          }
        }, 1000);
      });
    }).catch(() => {
      if (msgEl) msgEl.innerHTML = '<span style="color:var(--danger)">❌ 检查失败，请检查网络</span>';
      setTimeout(() => { if (msgEl) msgEl.innerHTML = ''; }, 2000);
    });
  }

  function _applyUpdate() {
    if (_waitingSW) {
      _waitingSW.postMessage({ action: 'skipWaiting' });
      // controllerchange event will fire and reload the page
    } else {
      // Content-only update: just reload
      window.location.reload();
    }
  }

  // ============ Lightbox ============
  function openLightbox(src) {
    if (!src) return;
    el('lightbox-img').src = src;
    el('lightbox').classList.add('show');
  }

  function closeLightbox() {
    el('lightbox').classList.remove('show');
    setTimeout(() => { el('lightbox-img').src = ''; }, 300);
  }

  // ============ Utilities ============
  function showToast(msg) {
    const toast = el('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => toast.classList.remove('show'), 2000);
  }

  // ============ Init ============
  function init() {
    // Form preview
    const daysInp = el('form-days');
    const deadlineInp = el('form-deadline');
    const _updateFormPreview = () => {
      const t = parseInt(daysInp.value) || 30;
      let dl = parseInt(deadlineInp.value) || 60;
      const minDl = getMinDeadlineDays(t, state.selectedRule);
      if (dl < minDl) dl = minDl;
      el('target-preview').textContent = t;
      el('deadline-preview').textContent = dl;
      el('pace-preview').textContent = Math.max(1, Math.round(dl / t));
      // Show minimum hint based on rule
      const hintEl = el('form-deadline-hint');
      if (hintEl) {
        if (state.selectedRule === 'strict') {
          hintEl.textContent = `严格模式：每天都需要打卡，至少 ${t} 天`;
        } else {
          const restDays = minDl - t;
          hintEl.textContent = `${state.selectedRule === 'lenient' ? '宽容' : '阶梯'}模式：含 ${restDays} 天休息日，至少 ${minDl} 天`;
        }
      }
    };
    if (daysInp && deadlineInp) {
      daysInp.addEventListener('input', _updateFormPreview);
      deadlineInp.addEventListener('input', _updateFormPreview);
      // Update preview when rule changes
      qsa('.rule-option').forEach(el => el.addEventListener('click', _updateFormPreview));
    }

    // Initialize default data if first load
    if (!localStorage.getItem(GOALS_KEY)) {
      saveGoals(getDefaultGoals());
    }

    // Register SW update detection
    _registerSWUpdate();

    renderDashboard();
    renderRewards();
  }

  // ============ Public API ============
  return {
    switchTab,
    openModal,
    closeModal,
    openCreateModal,
    openDetailModal,
    filterGoals,
    selectRule,
    handlePhotoUpload,
    removePhoto,
    removeGoalPhoto,
    replaceGoalPhoto,
    createGoal,
    deleteGoal,
    doCheckin,
    sendChat,
    toggleBackup,
    exportData,
    importData,
    openLightbox,
    closeLightbox,
    checkUpdate,
    init,
  };
})();

document.addEventListener('DOMContentLoaded', () => App.init());