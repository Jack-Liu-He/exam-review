(function () {
  "use strict";

  const TYPE_LABELS = {
    all: "全部题目",
    single: "单选题",
    multiple: "多选题",
    judge: "判断题",
    blank: "填空题",
    essay: "大题"
  };

  const QUESTION_BANK_ID = "renewable_heat_power";

  const STORAGE_KEYS = {
    wrong: `examReview_wrong_${QUESTION_BANK_ID}`,
    favorite: `examReview_favorites_${QUESTION_BANK_ID}`,
    completed: `examReview_completed_${QUESTION_BANK_ID}`,
    mode: `examReview_orderMode_${QUESTION_BANK_ID}`,
    theme: "examReview_theme"
  };

  const state = {
    type: "all",
    mode: readMode(),
    search: "",
    unfinishedOnly: false,
    memorizeMode: false,
    view: "normal",
    index: 0,
    currentRandomId: null,
    selected: new Set(),
    submitted: false,
    answerShown: false
  };

  const store = {
    wrong: readSet(STORAGE_KEYS.wrong),
    favorite: readSet(STORAGE_KEYS.favorite),
    completed: readSet(STORAGE_KEYS.completed)
  };

  const els = {};
  document.addEventListener("DOMContentLoaded", init);

  function init() {
    const loadedQuestions = getQuestions();
    if (!Array.isArray(loadedQuestions)) {
      document.body.innerHTML = "<main class=\"app-shell\"><section class=\"empty-state\"><h1>缺少题库数据</h1><p>没有找到可用的 questions.js 数据，请先补充题库文件。</p></section></main>";
      return;
    }

    bindElements();
    applyTheme(localStorage.getItem(STORAGE_KEYS.theme) || localStorage.getItem("reviewTheme") || "light");
    bindEvents();
    render();
  }

  function bindElements() {
    [
      "themeToggle", "totalCount", "filteredCount", "completedCount", "wrongCount", "favoriteCount",
      "searchInput", "typeFilters", "orderModeBtn", "randomModeBtn", "unfinishedOnlyBtn", "memorizeModeBtn",
      "wrongOnlyBtn", "favoriteOnlyBtn", "resetScopeBtn", "scopeName", "modeName", "scopeCompleted",
      "scopeRemaining", "prevBtn", "nextBtn", "positionText", "emptyState", "restartScopeBtn",
      "emptyWrongBtn", "emptyFavoriteBtn", "emptyAllBtn", "questionCard", "questionType",
      "questionCategory", "questionDone", "questionTitle", "favoriteBtn", "answerInputArea",
      "submitBtn", "showAnswerBtn", "memorizedBtn", "removeWrongBtn", "feedback", "answerPanel",
      "correctAnswer", "explanationBlock", "explanation"
    ].forEach((id) => {
      els[id] = document.getElementById(id);
    });
  }

  function bindEvents() {
    els.themeToggle.addEventListener("click", () => {
      applyTheme(document.body.classList.contains("dark") ? "light" : "dark");
    });

    els.searchInput.addEventListener("input", (event) => {
      state.search = event.target.value.trim().toLowerCase();
      resetPosition();
      render();
    });

    els.typeFilters.addEventListener("click", (event) => {
      const button = event.target.closest("[data-type]");
      if (!button) return;
      state.type = button.dataset.type;
      state.view = "normal";
      resetPosition();
      render();
    });

    els.orderModeBtn.addEventListener("click", () => setMode("order"));
    els.randomModeBtn.addEventListener("click", () => setMode("random"));
    els.unfinishedOnlyBtn.addEventListener("click", () => {
      state.unfinishedOnly = !state.unfinishedOnly;
      resetPosition();
      render();
    });
    els.memorizeModeBtn.addEventListener("click", () => {
      state.memorizeMode = !state.memorizeMode;
      resetQuestionState();
      render();
    });
    els.wrongOnlyBtn.addEventListener("click", () => setView("wrong"));
    els.favoriteOnlyBtn.addEventListener("click", () => setView("favorite"));
    els.resetScopeBtn.addEventListener("click", resetCurrentScopeProgress);
    els.restartScopeBtn.addEventListener("click", resetCurrentScopeProgress);
    els.emptyWrongBtn.addEventListener("click", () => setView("wrong"));
    els.emptyFavoriteBtn.addEventListener("click", () => setView("favorite"));
    els.emptyAllBtn.addEventListener("click", () => {
      state.type = "all";
      state.view = "normal";
      state.unfinishedOnly = false;
      state.search = "";
      els.searchInput.value = "";
      resetPosition();
      render();
    });
    els.prevBtn.addEventListener("click", () => move(-1));
    els.nextBtn.addEventListener("click", () => move(1));
    els.favoriteBtn.addEventListener("click", toggleFavorite);
    els.submitBtn.addEventListener("click", submitAnswer);
    els.showAnswerBtn.addEventListener("click", showAnswerAndMaybeComplete);
    els.memorizedBtn.addEventListener("click", markMemorized);
    els.removeWrongBtn.addEventListener("click", removeCurrentWrong);
  }

  function setMode(mode) {
    state.mode = mode;
    localStorage.setItem(STORAGE_KEYS.mode, mode);
    resetPosition();
    render();
  }

  function setView(view) {
    state.view = state.view === view ? "normal" : view;
    state.unfinishedOnly = false;
    resetPosition();
    render();
  }

  function resetPosition() {
    state.index = 0;
    state.currentRandomId = null;
    resetQuestionState();
  }

  function resetQuestionState() {
    state.selected = new Set();
    state.submitted = false;
    state.answerShown = false;
  }

  function getBaseScope() {
    return getQuestions().filter((q) => {
      if (state.type !== "all" && q.type !== state.type) return false;
      if (state.search && !searchText(q).includes(state.search)) return false;
      if (state.view === "wrong" && !store.wrong.has(q.id)) return false;
      if (state.view === "favorite" && !store.favorite.has(q.id)) return false;
      return true;
    });
  }

  function getPracticeScope() {
    const scope = getBaseScope();
    if (state.mode === "random") {
      const current = scope.find((q) => q.id === state.currentRandomId);
      const uncompleted = scope.filter((q) => !store.completed.has(q.id));
      return current && (state.submitted || state.answerShown) ? [current, ...uncompleted.filter((q) => q.id !== current.id)] : uncompleted;
    }
    if (state.unfinishedOnly) return scope.filter((q) => !store.completed.has(q.id));
    return scope;
  }

  function getCurrentQuestion(scope) {
    if (!scope.length) return null;
    if (state.mode === "random") {
      if (state.currentRandomId && scope.some((q) => q.id === state.currentRandomId)) {
        return scope.find((q) => q.id === state.currentRandomId);
      }
      const next = scope[Math.floor(Math.random() * scope.length)];
      state.currentRandomId = next.id;
      return next;
    }
    if (state.index >= scope.length) state.index = Math.max(0, scope.length - 1);
    return scope[state.index];
  }

  function render() {
    const baseScope = getBaseScope();
    const practiceScope = getPracticeScope();
    const question = getCurrentQuestion(practiceScope);
    renderStats(baseScope);
    renderControls(baseScope);

    const empty = !question;
    els.emptyState.classList.toggle("hidden", !empty);
    els.questionCard.classList.toggle("hidden", empty);
    els.prevBtn.disabled = empty || state.mode === "random" || state.index <= 0;
    els.nextBtn.disabled = empty || (state.mode === "order" && state.index >= practiceScope.length - 1);
    els.positionText.textContent = empty ? "第 0 / 0 题" : `第 ${state.mode === "order" ? state.index + 1 : 1} / ${practiceScope.length} 题`;

    if (!empty) renderQuestion(question);
  }

  function renderStats(baseScope) {
    const scopeCompleted = baseScope.filter((q) => store.completed.has(q.id)).length;
    els.totalCount.textContent = getQuestions().length;
    els.filteredCount.textContent = baseScope.length;
    els.completedCount.textContent = store.completed.size;
    els.wrongCount.textContent = store.wrong.size;
    els.favoriteCount.textContent = store.favorite.size;
    els.scopeName.textContent = state.view === "wrong" ? "错题" : state.view === "favorite" ? "收藏题" : TYPE_LABELS[state.type];
    els.modeName.textContent = state.mode === "random" ? "乱序" : "顺序";
    els.scopeCompleted.textContent = `${scopeCompleted} / ${baseScope.length}`;
    els.scopeRemaining.textContent = Math.max(0, baseScope.length - scopeCompleted);
  }

  function renderControls() {
    document.querySelectorAll("#typeFilters .chip").forEach((button) => {
      button.classList.toggle("active", button.dataset.type === state.type);
    });
    els.orderModeBtn.classList.toggle("active", state.mode === "order");
    els.randomModeBtn.classList.toggle("active", state.mode === "random");
    els.unfinishedOnlyBtn.classList.toggle("active", state.unfinishedOnly);
    els.memorizeModeBtn.classList.toggle("active", state.memorizeMode);
    els.wrongOnlyBtn.classList.toggle("active", state.view === "wrong");
    els.favoriteOnlyBtn.classList.toggle("active", state.view === "favorite");
  }

  function renderQuestion(question) {
    els.questionType.textContent = TYPE_LABELS[question.type] || question.sourceType || "题目";
    els.questionCategory.textContent = question.category || "未分类";
    els.questionDone.textContent = store.completed.has(question.id) ? "已完成" : "未完成";
    els.questionDone.classList.toggle("completed", store.completed.has(question.id));
    setSafeHtml(els.questionTitle, `${question.sourceNo ? question.sourceNo + ". " : ""}${question.question || ""}`);
    els.favoriteBtn.textContent = store.favorite.has(question.id) ? "已收藏" : "收藏";
    els.favoriteBtn.classList.toggle("active", store.favorite.has(question.id));
    els.removeWrongBtn.classList.toggle("hidden", !store.wrong.has(question.id));
    els.submitBtn.classList.toggle("hidden", state.memorizeMode || question.type === "essay");
    els.memorizedBtn.classList.toggle("hidden", !state.memorizeMode);
    els.showAnswerBtn.textContent = question.type === "essay" ? "显示答案" : "查看答案";
    els.feedback.className = "feedback hidden";
    els.feedback.textContent = "";
    els.answerPanel.classList.toggle("hidden", !state.memorizeMode && !state.answerShown);
    renderAnswerInput(question);
    renderAnswerPanel(question);
  }

  function renderAnswerInput(question) {
    els.answerInputArea.innerHTML = "";
    if (state.memorizeMode || question.type === "essay") return;

    if (question.type === "single" || question.type === "multiple") {
      const list = document.createElement("div");
      list.className = "option-list";
      (question.options || []).forEach((option, index) => {
        const key = optionKey(option, index);
        const item = document.createElement("button");
        item.type = "button";
        item.className = "option-item";
        item.dataset.key = key;
        item.innerHTML = `<span class="option-key">${escapeHtml(key)}</span><span class="option-text"></span>`;
        setSafeHtml(item.querySelector(".option-text"), stripOptionPrefix(option));
        item.classList.toggle("selected", state.selected.has(key));
        item.addEventListener("click", () => {
          if (question.type === "single") state.selected = new Set([key]);
          else if (state.selected.has(key)) state.selected.delete(key);
          else state.selected.add(key);
          renderQuestion(question);
        });
        list.appendChild(item);
      });
      els.answerInputArea.appendChild(list);
      return;
    }

    if (question.type === "judge") {
      const list = document.createElement("div");
      list.className = "option-list";
      [["√", "正确"], ["×", "错误"]].forEach(([key, label]) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "option-item";
        item.dataset.key = key;
        item.innerHTML = `<span class="option-key">${key}</span><span>${label}</span>`;
        item.classList.toggle("selected", state.selected.has(key));
        item.addEventListener("click", () => {
          state.selected = new Set([key]);
          renderQuestion(question);
        });
        list.appendChild(item);
      });
      els.answerInputArea.appendChild(list);
      return;
    }

    if (question.type === "blank") {
      const textarea = document.createElement("textarea");
      textarea.id = "blankAnswer";
      textarea.placeholder = "输入你的答案。多空题可以用分号、逗号或换行分隔。";
      els.answerInputArea.appendChild(textarea);
    }
  }

  function renderAnswerPanel(question) {
    setSafeHtml(els.correctAnswer, formatAnswer(question.answer));
    if (question.explanation) {
      els.explanationBlock.classList.remove("hidden");
      setSafeHtml(els.explanation, question.explanation);
    } else {
      els.explanationBlock.classList.add("hidden");
      els.explanation.textContent = "";
    }
  }

  function submitAnswer() {
    const question = getCurrentQuestion(getPracticeScope());
    if (!question) return;
    const correct = isCorrect(question);
    state.submitted = true;
    state.answerShown = true;
    markCompleted(question.id);
    if (correct) {
      store.wrong.delete(question.id);
      persistSet(STORAGE_KEYS.wrong, store.wrong);
      if (canAdvanceAfterCorrect()) {
        move(1);
        return;
      }
    } else {
      store.wrong.add(question.id);
      persistSet(STORAGE_KEYS.wrong, store.wrong);
    }
    render();
    els.feedback.className = `feedback ${correct ? "correct" : "wrong"}`;
    els.feedback.textContent = correct ? "回答正确" : `回答错误，正确答案是：${plainAnswer(question.answer)}`;
  }

  function canAdvanceAfterCorrect() {
    const scope = getPracticeScope();
    if (state.mode === "random") return scope.some((q) => !store.completed.has(q.id));
    return state.index < scope.length - 1;
  }

  function showAnswerAndMaybeComplete() {
    const question = getCurrentQuestion(getPracticeScope());
    if (!question) return;
    state.answerShown = true;
    if (question.type === "essay") markCompleted(question.id);
    render();
  }

  function markMemorized() {
    const question = getCurrentQuestion(getPracticeScope());
    if (!question) return;
    markCompleted(question.id);
    state.currentRandomId = null;
    render();
  }

  function toggleFavorite() {
    const question = getCurrentQuestion(getPracticeScope());
    if (!question) return;
    toggleSet(store.favorite, question.id);
    persistSet(STORAGE_KEYS.favorite, store.favorite);
    render();
  }

  function removeCurrentWrong() {
    const question = getCurrentQuestion(getPracticeScope());
    if (!question) return;
    store.wrong.delete(question.id);
    persistSet(STORAGE_KEYS.wrong, store.wrong);
    render();
  }

  function move(delta) {
    const scope = getPracticeScope();
    if (!scope.length) return;
    if (state.mode === "random") {
      state.currentRandomId = null;
    } else {
      state.index = Math.min(Math.max(state.index + delta, 0), scope.length - 1);
    }
    resetQuestionState();
    render();
  }

  function resetCurrentScopeProgress() {
    getBaseScope().forEach((q) => store.completed.delete(q.id));
    persistSet(STORAGE_KEYS.completed, store.completed);
    state.currentRandomId = null;
    state.index = 0;
    render();
  }

  function markCompleted(id) {
    store.completed.add(id);
    persistSet(STORAGE_KEYS.completed, store.completed);
  }

  function isCorrect(question) {
    if (question.type === "single" || question.type === "judge") {
      return normalizeChoice([...state.selected][0] || "") === normalizeChoice(question.answer);
    }
    if (question.type === "multiple") {
      const selected = [...state.selected].map(normalizeChoice).sort().join("");
      return selected === multipleAnswerKeys(question.answer).map(normalizeChoice).sort().join("");
    }
    if (question.type === "blank") {
      const input = document.getElementById("blankAnswer")?.value || "";
      return normalizeText(input) && blankAnswerMatches(input, question.answer);
    }
    return false;
  }

  function blankAnswerMatches(input, answer) {
    const user = normalizeText(input);
    const correct = normalizeText(String(answer || ""));
    if (user === correct) return true;
    const answerParts = String(answer || "")
      .replace(/第[0-9一二三四五六七八九十]+空[:：]/g, "")
      .split(/[;；,，、\n]/)
      .map(normalizeText)
      .filter(Boolean);
    return answerParts.length > 0 && answerParts.every((part) => user.includes(part));
  }

  function searchText(q) {
    return [
      q.question,
      formatAnswer(q.answer),
      q.category,
      q.sourceType,
      ...(q.options || [])
    ].join(" ").toLowerCase();
  }

  function getQuestions() {
    return typeof questions !== "undefined" ? questions : window.questions;
  }

  function optionKey(option, index) {
    const match = String(option || "").match(/^\s*([A-Z])[\s、.．]/i);
    return match ? match[1].toUpperCase() : String.fromCharCode(65 + index);
  }

  function stripOptionPrefix(option) {
    return String(option || "").replace(/^\s*[A-Z][\s、.．]/i, "");
  }

  function normalizeChoice(value) {
    return String(value || "")
      .replace(/[Ａ-Ｚａ-ｚ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 65248))
      .replace(/[正确对是√✓]/g, "√")
      .replace(/[错误错否×xX]/g, "×")
      .trim()
      .toUpperCase();
  }

  function multipleAnswerKeys(answer) {
    if (Array.isArray(answer)) return answer;
    const value = String(answer || "").trim();
    const compact = value.replace(/[Ａ-Ｚａ-ｚ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 65248));
    const leading = compact.match(/^[A-H]+(?=[\s（(、,，;；]|$)/i);
    if (leading) return leading[0].split("");
    return [...compact.matchAll(/[A-H](?=[、,，.．\s]|$)/gi)].map((match) => match[0]);
  }

  function normalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[，。；;、,：:（）()]/g, "")
      .replace(/正确|对|是/g, "√")
      .replace(/错误|错|否/g, "×");
  }

  function formatAnswer(answer) {
    return Array.isArray(answer) ? answer.join("、") : String(answer ?? "");
  }

  function plainAnswer(answer) {
    const holder = document.createElement("div");
    setSafeHtml(holder, formatAnswer(answer));
    return holder.textContent || "";
  }

  function applyTheme(theme) {
    document.body.classList.toggle("dark", theme === "dark");
    els.themeToggle.textContent = theme === "dark" ? "白天模式" : "夜间模式";
    localStorage.setItem(STORAGE_KEYS.theme, theme);
  }

  function readSet(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "[]");
      return new Set(Array.isArray(value) ? value : []);
    } catch {
      return new Set();
    }
  }

  function readMode() {
    const mode = localStorage.getItem(STORAGE_KEYS.mode);
    return mode === "random" ? "random" : "order";
  }

  function persistSet(key, set) {
    localStorage.setItem(key, JSON.stringify([...set]));
  }

  function toggleSet(set, value) {
    if (set.has(value)) set.delete(value);
    else set.add(value);
  }

  function setSafeHtml(element, html) {
    const placeholders = [];
    const source = String(html ?? "").replace(/<\/?(sub|sup|br|b|strong|i|em|u)>/gi, (tag) => {
      const token = `__SAFE_TAG_${placeholders.length}__`;
      placeholders.push(normalizeAllowedTag(tag));
      return token;
    });
    let escaped = escapeHtml(source).replace(/\n/g, "<br>");
    placeholders.forEach((tag, index) => {
      escaped = escaped.replace(`__SAFE_TAG_${index}__`, tag);
    });
    element.innerHTML = escaped;
  }

  function normalizeAllowedTag(tag) {
    const match = tag.match(/^<(\/?)(sub|sup|br|b|strong|i|em|u)>$/i);
    if (!match) return "";
    const slash = match[1];
    const name = match[2].toLowerCase();
    return name === "br" ? "<br>" : `<${slash}${name}>`;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
})();
