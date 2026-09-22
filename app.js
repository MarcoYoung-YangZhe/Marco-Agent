"use strict";

/*
  推荐目录结构：

  Marco-Agent/
  ├── index.html
  ├── app.js
  ├── logo.jpg
  └── avatars/
      ├── user-01.jpg
      ├── user-02.jpg
      ├── assistant-01.jpg
      └── assistant-02.jpg
*/

const ASSETS = {
  logo: "./logo.jpg",

  userAvatars: [
    "./avatars/user-01.jpg",
    "./avatars/user-02.jpg",
    "./avatars/user-03.jpg",
    "./avatars/user-04.jpg",
    "./avatars/user-05.jpg",
    "./avatars/user-06.jpg",
    "./avatars/user-07.jpg",
    "./avatars/user-08.jpg"
  ],

  assistantAvatars: [
    "./avatars/assistant-01.jpg",
    "./avatars/assistant-02.jpg",
    "./avatars/assistant-03.jpg",
    "./avatars/assistant-04.jpg",
    "./avatars/assistant-05.jpg",
    "./avatars/assistant-06.jpg",
    "./avatars/assistant-07.jpg",
    "./avatars/assistant-08.jpg"
  ]
};

const $ = (id) => document.getElementById(id);

const CONVERSATIONS_KEY = "marco-agent-conversations-v6";
const SETTINGS_KEY = "marco-agent-settings-v6";

const FILE_LIMITS = {
  imageBytes: Infinity,
  textBytes: Infinity,
  documentBytes: Infinity,
  textChars: Infinity
};

const DEFAULT_SETTINGS = {
  apiBase: "https://api.openai.com/v1",
  apiKey: "",
  rememberApiKey: true,
  model: "gpt-4o-mini",
  temperature: "0.7",
  systemPrompt: ""
};

const state = {
  conversations: [],
  currentId: null,
  attachments: []
};

let settings = {
  ...DEFAULT_SETTINGS
};
let modelLoadTimer = null;
let modelLoadController = null;

/* ================= 基础工具 ================= */

function uid() {
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 9)
  );
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    };

    return map[char];
  });
}

function formatSize(size) {
  if (size < 1024) {
    return size + " B";
  }

  if (size < 1024 * 1024) {
    return (size / 1024).toFixed(1) + " KB";
  }

  return (size / 1024 / 1024).toFixed(2) + " MB";
}

function showToast(message, type = "") {
  const toast = document.createElement("div");

  toast.className = "toast" + (type === "error" ? " error" : "");
  toast.textContent = message;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity .25s";

    setTimeout(() => {
      toast.remove();
    }, 280);
  }, 2400);
}

function copyText(text) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(String(text ?? ""));
  }

  const textarea = document.createElement("textarea");

  textarea.value = String(text ?? "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";

  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();

  return Promise.resolve();
}

function readAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve(String(reader.result));
    };

    reader.onerror = () => {
      reject(new Error("读取文本文件失败"));
    };

    reader.readAsText(file, "utf-8");
  });
}

function safeHTTPUrl(value) {
  try {
    const url = new URL(String(value).trim());

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "";
    }

    return url.href;
  } catch {
    return "";
  }
}

function pickRandom(array) {
  if (!Array.isArray(array) || !array.length) {
    return "";
  }

  return array[Math.floor(Math.random() * array.length)];
}

function getFileExtension(filename) {
  const parts = String(filename).toLowerCase().split(".");

  return parts.length > 1 ? parts.pop() : "";
}

function scrollBottom(force = false) {
  const chat = $("chat");

  const nearBottom =
    chat.scrollHeight -
    chat.scrollTop -
    chat.clientHeight < 180;

  if (force || nearBottom) {
    chat.scrollTop = chat.scrollHeight;
  }
}

/* ================= 设置 ================= */

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);

    if (raw) {
      const parsed = JSON.parse(raw);

      if (parsed && typeof parsed === "object") {
        settings = {
          ...DEFAULT_SETTINGS,
          ...parsed
        };
      }
    }
  } catch {
    settings = {
      ...DEFAULT_SETTINGS
    };
  }

 $("apiBase").value = settings.apiBase;
$("temperature").value = settings.temperature;
  $("systemPrompt").value = settings.systemPrompt;

  $("rememberApiKey").checked = settings.rememberApiKey !== false;

  $("apiKey").value =
    settings.rememberApiKey !== false
      ? settings.apiKey || ""
      : "";

  applyLogo();
  updateStatus();
}

function setInitialModel() {
  const select = $("model");

  if (!settings.model) {
    return;
  }

  const option = document.createElement("option");

  option.value = settings.model;
  option.textContent = settings.model;

  select.appendChild(option);
  select.value = settings.model;
}

function readSettingsForm() {
  const base = $("apiBase").value.trim();

  settings.apiBase = safeHTTPUrl(base)
    ? base.replace(/\/+$/, "")
    : "";

  settings.apiKey = $("apiKey").value.trim();
  settings.rememberApiKey = $("rememberApiKey").checked;
  settings.model = $("model").value.trim();
  settings.temperature = $("temperature").value;
  settings.systemPrompt = $("systemPrompt").value;
}

function saveSettings() {
  readSettingsForm();

  try {
    const data = {
      apiBase: settings.apiBase,
      model: settings.model,
      temperature: settings.temperature,
      systemPrompt: settings.systemPrompt,
      rememberApiKey: settings.rememberApiKey,
      apiKey: settings.rememberApiKey ? settings.apiKey : ""
    };

    localStorage.setItem(SETTINGS_KEY, JSON.stringify(data));
    updateStatus();

    return true;
  } catch {
    showToast("设置保存失败，可能是浏览器存储空间不足", "error");
    return false;
  }
}

function updateStatus() {
  const ready =
    Boolean(settings.apiBase) &&
    Boolean($("apiKey").value.trim()) &&
    Boolean(settings.model);

  $("statusDot").classList.toggle("ready", ready);
}

function applyLogo() {
  const brandLogo = $("brandLogo");

  if (!brandLogo) {
    return;
  }

  brandLogo.replaceChildren();

  const image = document.createElement("img");

  image.src = ASSETS.logo + "?v=" + Date.now();
  image.alt = "Marco Agent Logo";

  image.onerror = () => {
    brandLogo.replaceChildren();
    brandLogo.textContent = "M";

    console.warn("Logo 加载失败，请检查路径：", ASSETS.logo);
  };

  brandLogo.appendChild(image);
}

/* ================= 会话 ================= */

function createConversationData() {
  return {
    id: uid(),
    title: "新对话",
    createdAt: Date.now(),
    updatedAt: Date.now(),

    avatars: {
      user: pickRandom(ASSETS.userAvatars),
      assistant: pickRandom(ASSETS.assistantAvatars)
    },

    messages: []
  };
}

function ensureConversationData(conversation) {
  if (!conversation.avatars) {
    conversation.avatars = {};
  }

  if (!conversation.avatars.user) {
    conversation.avatars.user = pickRandom(ASSETS.userAvatars);
  }

  if (!conversation.avatars.assistant) {
    conversation.avatars.assistant = pickRandom(
      ASSETS.assistantAvatars
    );
  }

  if (!Array.isArray(conversation.messages)) {
    conversation.messages = [];
  }

  /*
    页面刷新时，正在生成的临时回答不能继续保留为“生成中”。
  */
  conversation.messages = conversation.messages.filter(
    (message) =>
      !(
        message &&
        message.role === "assistant" &&
        message.status === "streaming"
      )
  );

  conversation.messages.forEach((message) => {
    if (!message.id) {
      message.id = uid();
    }
  });

  if (!conversation.title) {
    conversation.title = "新对话";
  }

  if (!conversation.updatedAt) {
    conversation.updatedAt = Date.now();
  }

  /*
    _run 只存在于内存中，不能保存到 localStorage。
  */
  delete conversation._run;
}

function currentConversation() {
  return (
    state.conversations.find(
      (conversation) =>
        conversation.id === state.currentId
    ) || null
  );
}

function currentRun() {
  return currentConversation()?._run || null;
}

function cancelConversationRun(
  conversation,
  reason = "stop"
) {
  const run = conversation?._run;

  if (!run || !run.running) {
    return;
  }

  run.cancelReason = reason;

  try {
    run.controller.abort();
  } catch {
    // 忽略 AbortController 异常
  }
}

function serializeConversation(conversation) {
  return {
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    avatars: conversation.avatars,

    /*
      正在生成中的临时 assistant 消息不保存。
    */
    messages: conversation.messages.filter(
      (message) =>
        !(
          message &&
          message.role === "assistant" &&
          message.status === "streaming"
        )
    )
  };
}

function persistConversations() {
  try {
    const data = {
      conversations: state.conversations.map(
        serializeConversation
      ),
      currentId: state.currentId
    };

    localStorage.setItem(
      CONVERSATIONS_KEY,
      JSON.stringify(data)
    );
  } catch (error) {
    console.warn(
      "历史记录保存失败，可能是附件太大：",
      error
    );

    showToast(
      "当前对话可以继续使用，但附件过大，无法完整保存到浏览器",
      "error"
    );
  }
}

function loadConversations() {
  try {
    const raw = localStorage.getItem(
      CONVERSATIONS_KEY
    );

    if (raw) {
      const parsed = JSON.parse(raw);

      if (Array.isArray(parsed.conversations)) {
        state.conversations =
          parsed.conversations.filter(
            (conversation) =>
              conversation &&
              conversation.id &&
              Array.isArray(conversation.messages)
          );
      }

      state.currentId = parsed.currentId || null;
    }
  } catch {
    state.conversations = [];
    state.currentId = null;
  }

  state.conversations.forEach(
    ensureConversationData
  );

  if (!state.conversations.length) {
    const conversation = createConversationData();

    state.conversations = [conversation];
    state.currentId = conversation.id;
  }

  if (!currentConversation()) {
    state.currentId =
      state.conversations[0].id;
  }

  persistConversations();
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();

  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function renderHistory() {
  const list = $("historyList");
  const keyword = $("historySearch").value
    .trim()
    .toLowerCase();

  list.replaceChildren();

  const conversations = [...state.conversations]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .filter((conversation) => {
      if (!keyword) {
        return true;
      }

      return String(conversation.title)
        .toLowerCase()
        .includes(keyword);
    });

  if (!conversations.length) {
    const empty = document.createElement("div");

    empty.className = "empty";
    empty.textContent = "没有匹配的对话";

    list.appendChild(empty);
    return;
  }

  conversations.forEach((conversation) => {
    const item = document.createElement("div");

    item.className = "history-item";
    item.dataset.id = conversation.id;

    if (conversation.id === state.currentId) {
      item.classList.add("active");
    }

    const main = document.createElement("div");
    main.className = "history-main";

    const title = document.createElement("div");
    title.className = "history-title";
    title.textContent = conversation.title;

    const meta = document.createElement("div");
    meta.className = "history-meta";

    const roundCount = conversation.messages.filter(
      (message) => message.role === "user"
    ).length;

    const runningText = conversation._run?.running
      ? " · 生成中"
      : "";

    meta.textContent =
      `${formatTime(conversation.updatedAt)} · ` +
      `${roundCount} 轮${runningText}`;

    main.append(title, meta);

    const deleteButton = document.createElement("button");

    deleteButton.className = "history-delete";
    deleteButton.textContent = "×";
    deleteButton.title = "删除对话";

    item.append(main, deleteButton);
    list.appendChild(item);
  });
}

function updateConversationName() {
  const conversation = currentConversation();

  $("conversationName").textContent =
    conversation &&
    conversation.title !== "新对话"
      ? "· " + conversation.title
      : "";
}

function resetComposer() {
  $("messageInput").value = "";
  state.attachments = [];

  autoResize();
  renderAttachments();
}

function createNewConversation() {
  /*
    不再判断 state.running。
    即使其他对话正在回答，也可以创建新对话。
  */
  const conversation = createConversationData();

  state.conversations.unshift(conversation);
  state.currentId = conversation.id;

  resetComposer();

  persistConversations();
  renderHistory();
  renderMessages();
  updateConversationName();

  closeSidebarOnMobile();
  $("messageInput").focus();
}

function switchConversation(id) {
  /*
    不再禁止切换。
    其他对话可以在后台继续生成。
  */
  if (!state.conversations.some(
    (conversation) => conversation.id === id
  )) {
    return;
  }

  state.currentId = id;

  resetComposer();

  persistConversations();
  renderHistory();
  renderMessages();
  updateConversationName();

  closeSidebarOnMobile();
}

function deleteConversation(id) {
  const conversation = state.conversations.find(
    (item) => item.id === id
  );

  if (!conversation) {
    return;
  }

  if (
    !confirm(
      `确定删除「${conversation.title}」吗？`
    )
  ) {
    return;
  }

  /*
    删除对话时，同时终止这个对话正在进行的请求。
  */
  cancelConversationRun(
    conversation,
    "delete-conversation"
  );

  conversation._run = null;

  state.conversations =
    state.conversations.filter(
      (item) => item.id !== id
    );

  if (!state.conversations.length) {
    const fresh = createConversationData();

    state.conversations = [fresh];
    state.currentId = fresh.id;
  } else if (state.currentId === id) {
    state.currentId =
      state.conversations[0].id;
  }

  resetComposer();

  persistConversations();
  renderHistory();
  renderMessages();
  updateConversationName();
}

function clearCurrentConversation() {
  const conversation = currentConversation();

  if (!conversation) {
    return;
  }

  if (
    !conversation.messages.length &&
    !conversation._run?.running
  ) {
    showToast("当前对话已经为空");
    return;
  }

  if (!confirm("确定清空当前对话吗？")) {
    return;
  }

  cancelConversationRun(
    conversation,
    "clear-conversation"
  );

  conversation._run = null;
  conversation.messages = [];
  conversation.title = "新对话";
  conversation.updatedAt = Date.now();

  resetComposer();

  persistConversations();
  renderHistory();
  renderMessages();
  updateConversationName();
}

/* ================= Markdown 与公式渲染 ================= */

function renderMarkdown(source) {
  let text = String(source || "");

  const codeBlocks = [];
  const formulas = [];

  text = text.replace(
    /```([\w+#.-]*)[ \t]*\r?\n?([\s\S]*?)(?:```|$)/g,
    (_, language, code) => {
      const index = codeBlocks.length;

      codeBlocks.push({
        language: language || "code",
        code: code.replace(/\n$/, "")
      });

      return `CODEBLOCKTOKEN${index}END`;
    }
  );

  text = text.replace(
    /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$[^$\n]+\$)/g,
    (formula) => {
      const index = formulas.length;

      formulas.push(formula);

      return `MATHTOKEN${index}END`;
    }
  );

  const lines = text.split("\n");
  const output = [];

  let listType = null;

  function closeList() {
    if (listType) {
      output.push(`</${listType}>`);
      listType = null;
    }
  }

  function inlineMarkdown(value) {
    let result = escapeHTML(value);

    result = result.replace(/`([^`\n]+)`/g, "<code>$1</code>");
    result = result.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");

    result = result.replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      (_, label, url) => {
        const safeURL = safeHTTPUrl(url);

        if (!safeURL) {
          return escapeHTML(label);
        }

        return (
          `<a class="message-link" href="${escapeHTML(safeURL)}" ` +
          `target="_blank" rel="noopener noreferrer">` +
          `${escapeHTML(label)}</a>`
        );
      }
    );

    return result;
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      closeList();
      continue;
    }

    const codeMatch = line.match(/^CODEBLOCKTOKEN(\d+)END$/);

    if (codeMatch) {
      closeList();

      const block = codeBlocks[Number(codeMatch[1])];

      output.push(
        `<div class="code-block">` +
          `<div class="code-header">` +
            `<span>${escapeHTML(block.language)}</span>` +
            `<button class="copy-code">复制</button>` +
          `</div>` +
          `<pre><code>${escapeHTML(block.code)}</code></pre>` +
        `</div>`
      );

      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);

    if (heading) {
      closeList();

      const level = heading[1].length;

      output.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const unordered = line.match(/^[-*+]\s+(.+)$/);

    if (unordered) {
      if (listType !== "ul") {
        closeList();
        output.push("<ul>");
        listType = "ul";
      }

      output.push(`<li>${inlineMarkdown(unordered[1])}</li>`);
      continue;
    }

    const ordered = line.match(/^\d+[.)]\s+(.+)$/);

    if (ordered) {
      if (listType !== "ol") {
        closeList();
        output.push("<ol>");
        listType = "ol";
      }

      output.push(`<li>${inlineMarkdown(ordered[1])}</li>`);
      continue;
    }

    closeList();
    output.push(`<p>${inlineMarkdown(line)}</p>`);
  }

  closeList();

  let html = output.join("");

  formulas.forEach((formula, index) => {
    const token = `MATHTOKEN${index}END`;

    html = html
      .split(token)
      .join(
        `<span class="math-source">${escapeHTML(formula)}</span>`
      );
  });

  return html;
}

function renderMath(root) {
  if (!root) {
    return;
  }

  const render = () => {
    if (typeof window.renderMathInElement !== "function") {
      return;
    }

    try {
      window.renderMathInElement(root, {
        delimiters: [
          {
            left: "$$",
            right: "$$",
            display: true
          },
          {
            left: "\\[",
            right: "\\]",
            display: true
          },
          {
            left: "\\(",
            right: "\\)",
            display: false
          },
          {
            left: "$",
            right: "$",
            display: false
          }
        ],

        throwOnError: false,

        ignoredTags: [
          "script",
          "noscript",
          "style",
          "textarea",
          "pre",
          "code"
        ]
      });
    } catch (error) {
      console.warn("KaTeX 公式渲染失败：", error);
    }
  };

  if (typeof window.renderMathInElement === "function") {
    requestAnimationFrame(render);
  } else {
    window.addEventListener("load", render, { once: true });
  }
}

function appendMarkdown(container, content) {
  container.innerHTML = renderMarkdown(content);
  renderMath(container);
}

/* ================= 消息显示 ================= */

function createAvatar(url, fallback) {
  const avatar = document.createElement("div");

  avatar.className = "avatar";

  if (!url) {
    avatar.textContent = fallback;
    return avatar;
  }

  const image = document.createElement("img");

  image.src = url;
  image.alt = "";

  image.onerror = () => {
    avatar.replaceChildren();
    avatar.textContent = fallback;
  };

  avatar.appendChild(image);

  return avatar;
}

function createWelcome() {
  const welcome = document.createElement("div");
  welcome.className = "welcome";

  const logo = document.createElement("div");
  logo.className = "welcome-logo";

  const image = document.createElement("img");

  image.src = ASSETS.logo + "?v=" + Date.now();
  image.alt = "Marco Agent Logo";

  image.onerror = () => {
    logo.replaceChildren();
    logo.textContent = "M";
  };

  logo.appendChild(image);

  const title = document.createElement("h1");
  title.textContent = "Marco Agent";

  const description = document.createElement("p");
  description.textContent =
    "连接 API 后，可以进行对话、写代码和分析文件。";

  welcome.append(logo, title, description);

  return welcome;
}

function contentToText(content) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .filter((item) => item.type === "text")
      .map((item) => item.text || "")
      .join("\n");
  }

  return "";
}

function createMessageAction(
  action,
  index,
  title,
  text
) {
  const button = document.createElement("button");

  button.className = "small-btn";
  button.dataset.action = action;
  button.dataset.index = String(index);
  button.title = title;
  button.textContent = text;

  return button;
}

function createUserMessage(
  message,
  conversation,
  index
) {
  const wrapper = document.createElement("div");

  wrapper.className = "message user";

  const avatar = createAvatar(
    conversation.avatars?.user,
    "🙂"
  );

  const bubble = document.createElement("div");

  bubble.className = "bubble";

  const display = message.display || {};

  if (Array.isArray(display.images)) {
    const imageWrap = document.createElement("div");

    imageWrap.className = "message-images";

    display.images.forEach((item) => {
      if (!item.dataUrl) {
        return;
      }

      const image = document.createElement("img");

      image.src = item.dataUrl;
      image.alt = item.name || "图片";

      imageWrap.appendChild(image);
    });

    if (imageWrap.children.length) {
      bubble.appendChild(imageWrap);
    }
  }

  if (Array.isArray(display.files)) {
    display.files.forEach((file) => {
      const fileBox = document.createElement("div");

      fileBox.className = "message-file";

      const header = document.createElement("div");

      header.className = "message-file-header";

      const icon = document.createElement("span");
      icon.textContent = "▧";

      const name = document.createElement("span");

      name.className = "message-file-name";
      name.textContent = file.name || "文件";

      const size = document.createElement("span");

      size.className = "message-file-size";
      size.textContent = formatSize(file.size || 0);

      header.append(icon, name, size);

      const content = document.createElement("div");

      content.className = "message-file-content";
      content.textContent = file.content || "";

      fileBox.append(header, content);
      bubble.appendChild(fileBox);
    });
  }

  if (display.text?.trim()) {
    const text = document.createElement("div");

    text.textContent = display.text;
    bubble.appendChild(text);
  }

  /*
    给用户问题添加删除按钮。
    删除用户问题时，会同时删除紧跟着的回答。
  */
  const actions = document.createElement("div");

  actions.className = "assistant-actions";

  actions.appendChild(
    createMessageAction(
      "delete-message",
      index,
      "删除这一轮",
      "🗑"
    )
  );

  bubble.appendChild(actions);

  wrapper.append(avatar, bubble);

  return wrapper;
}

function createAssistantMessage(
  message,
  conversation,
  index
) {
  const wrapper = document.createElement("div");

  wrapper.className = "message assistant";

  const avatar = createAvatar(
    conversation.avatars?.assistant,
    "M"
  );

  const bubble = document.createElement("div");

  bubble.className = "bubble";

  const content = contentToText(
    message.content
  );

  appendMarkdown(
    bubble,
    content ||
      (
        message.status === "streaming"
          ? "正在生成回答……"
          : "（模型没有返回内容）"
      )
  );

  if (message.status === "streaming") {
    const cursor = document.createElement("span");

    cursor.className = "cursor";
    bubble.appendChild(cursor);
  }

  const actions = document.createElement("div");

  actions.className = "assistant-actions";

  if (message.status !== "streaming") {
    actions.appendChild(
      createMessageAction(
        "copy",
        index,
        "复制回答",
        "⧉"
      )
    );

    actions.appendChild(
      createMessageAction(
        "latex",
        index,
        "导出 LaTeX 文件",
        "Tₓ"
      )
    );

    actions.appendChild(
      createMessageAction(
        "regenerate",
        index,
        "重新生成",
        "↻"
      )
    );
  }

  actions.appendChild(
    createMessageAction(
      "delete-message",
      index,
      "删除回答",
      "🗑"
    )
  );

  bubble.appendChild(actions);

  wrapper.append(avatar, bubble);

  return wrapper;
}

function createStreamingMessage(conversation) {
  const wrapper = document.createElement("div");

  wrapper.className = "message assistant";

  const avatar = createAvatar(conversation.avatars?.assistant, "M");

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  wrapper.append(avatar, bubble);
  $("chatInner").appendChild(wrapper);

  return bubble;
}

function renderMessages(forceScroll = true) {
  const chatInner = $("chatInner");

  chatInner.replaceChildren();

  const conversation = currentConversation();

  if (!conversation || !conversation.messages.length) {
    chatInner.appendChild(createWelcome());
    renderRunPanel();
    return;
  }

  conversation.messages.forEach((message, index) => {
    if (message.role === "user") {
      chatInner.appendChild(
        createUserMessage(
          message,
          conversation,
          index
        )
      );
    }

    if (message.role === "assistant") {
      chatInner.appendChild(
        createAssistantMessage(
          message,
          conversation,
          index
        )
      );
    }
  });

  if (forceScroll) {
    scrollBottom(true);
  } else {
    scrollBottom(false);
  }

  renderRunPanel();
}

function addError(message) {
  const errorBox = document.createElement("div");

  errorBox.className = "error-box";
  errorBox.textContent = "⚠ " + message;

  $("chatInner").appendChild(errorBox);
  scrollBottom(true);
}

/* ================= 文件上传 ================= */

function isTextFile(file) {
  if (file.type.startsWith("text/")) {
    return true;
  }

  return [
    "txt",
    "md",
    "markdown",
    "json",
    "csv",
    "html",
    "htm",
    "css",
    "js",
    "mjs",
    "ts",
    "tsx",
    "jsx",
    "py",
    "java",
    "c",
    "cpp",
    "h",
    "hpp",
    "go",
    "rs",
    "php",
    "sql",
    "yaml",
    "yml",
    "xml",
    "log"
  ].includes(getFileExtension(file.name));
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      const image = new Image();

      image.onload = () => {
        let width = image.width;
        let height = image.height;

        const maxEdge = 1600;

        const scale = Math.min(
          1,
          maxEdge / Math.max(width, height)
        );

        width = Math.max(1, Math.round(width * scale));
        height = Math.max(1, Math.round(height * scale));

        const canvas = document.createElement("canvas");

        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext("2d");

        context.drawImage(image, 0, 0, width, height);

        let dataUrl = canvas.toDataURL(
          file.type === "image/png" ? "image/png" : "image/jpeg",
          0.82
        );

        if (dataUrl.length > 1000000) {
          dataUrl = canvas.toDataURL("image/jpeg", 0.68);
        }

        resolve(dataUrl);
      };

      image.onerror = () => {
        reject(new Error("图片无法解析"));
      };

      image.src = event.target.result;
    };

    reader.onerror = () => {
      reject(new Error("读取图片失败"));
    };

    reader.readAsDataURL(file);
  });
}

async function readPdfText(file) {
  if (!window.pdfjsLib) {
    throw new Error("PDF 解析库没有加载，请检查网络连接");
  }

  const buffer = await file.arrayBuffer();

  const pdf = await window.pdfjsLib.getDocument({
    data: buffer,
    disableWorker: true
  }).promise;

  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();

    const pageText = textContent.items
      .map((item) => item.str || "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    pages.push(`【第 ${pageNumber} 页】\n${pageText}`);
  }

  return pages.join("\n\n");
}

async function readDocxText(file) {
  if (!window.mammoth) {
    throw new Error("DOCX 解析库没有加载，请检查网络连接");
  }

  const buffer = await file.arrayBuffer();

  const result = await window.mammoth.extractRawText({
    arrayBuffer: buffer
  });

  return result.value || "";
}

async function prepareAttachment(file) {
  const extension = getFileExtension(file.name);

  if (file.type.startsWith("image/")) {
    return {
      kind: "image",
      name: file.name,
      size: file.size,
      dataUrl: await compressImage(file)
    };
  }

  if (extension === "pdf" || extension === "docx") {
    let content =
      extension === "pdf"
        ? await readPdfText(file)
        : await readDocxText(file);

    const originalLength = content.length;
    let truncated = false;

    if (
      Number.isFinite(FILE_LIMITS.textChars) &&
      content.length > FILE_LIMITS.textChars
    ) {
      content = content.slice(
        0,
        FILE_LIMITS.textChars
      );

      truncated = true;
    }

    return {
      kind: "file",
      name: file.name,
      size: file.size,
      extension,
      content,
      truncated,
      originalLength
    };
  }

  if (extension === "doc") {
    throw new Error(
      `暂不支持旧版 .doc 文件，请另存为 .docx 后上传：${file.name}`
    );
  }

  if (!isTextFile(file)) {
    throw new Error(
      `暂不支持「${file.name}」这种文件`
    );
  }

  let content = await readAsText(file);

  const originalLength = content.length;
  let truncated = false;

  if (
    Number.isFinite(FILE_LIMITS.textChars) &&
    content.length > FILE_LIMITS.textChars
  ) {
    content = content.slice(
      0,
      FILE_LIMITS.textChars
    );

    truncated = true;
  }

  return {
    kind: "file",
    name: file.name,
    size: file.size,
    extension,
    content,
    truncated,
    originalLength
  };
}

async function addFiles(fileList) {
  for (const file of Array.from(fileList || [])) {
    try {
      const attachment = await prepareAttachment(file);

      state.attachments.push(attachment);
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  renderAttachments();
}

function renderAttachments() {
  const container = $("attachments");

  container.replaceChildren();

  state.attachments.forEach((item, index) => {
    const box = document.createElement("div");
    box.className = "attachment";

    if (item.kind === "image") {
      const image = document.createElement("img");

      image.src = item.dataUrl;
      image.alt = item.name;

      box.appendChild(image);
    } else {
      const icon = document.createElement("span");
      icon.textContent = item.extension === "pdf" ? "PDF" : "▧";

      box.appendChild(icon);
    }

    const textBox = document.createElement("div");

    const name = document.createElement("div");
    name.className = "attachment-name";
    name.textContent = item.name;

    const meta = document.createElement("div");
    meta.className = "attachment-meta";

    meta.textContent =
      formatSize(item.size) +
      (item.truncated ? " · 已截断" : "");

    textBox.append(name, meta);

    const removeButton = document.createElement("button");

    removeButton.className = "remove-attachment";
    removeButton.dataset.index = String(index);
    removeButton.textContent = "×";
    removeButton.title = "移除附件";

    box.append(textBox, removeButton);
    container.appendChild(box);
  });

  updateSendButton();
}

function buildUserMessage(text, attachments) {
  const images = attachments.filter(
    (item) => item.kind === "image"
  );

  const files = attachments.filter(
    (item) => item.kind === "file"
  );

  let fullText = text || "";

  files.forEach((file) => {
    fullText +=
      `\n\n【文件：${file.name}】\n` +
      "```text\n" +
      file.content +
      "\n```\n" +
      "【文件结束】";

    if (file.truncated) {
      fullText += "\n【提示：文件内容已被截断】";
    }
  });

  if (!fullText.trim() && images.length) {
    fullText = "请查看我上传的图片。";
  }

  const apiContent = images.length
    ? [
        {
          type: "text",
          text: fullText
        },
        ...images.map((image) => ({
          type: "image_url",
          image_url: {
            url: image.dataUrl
          }
        }))
      ]
    : fullText;

  return {
    id: uid(),
    role: "user",
    content: apiContent,

    display: {
      text,
      images: images.map((image) => ({
        name: image.name,
        dataUrl: image.dataUrl
      })),
      files: files.map((file) => ({
        name: file.name,
        size: file.size,
        extension: file.extension,
        content: file.content
      }))
    }
  };
}

/* ================= API 请求 ================= */

function getEndpoint() {
  if (!settings.apiBase) {
    throw new Error("API 地址不正确");
  }

  const base = settings.apiBase.replace(/\/+$/, "");

  if (base.endsWith("/chat/completions")) {
    return base;
  }

  return base + "/chat/completions";
}

function getModelsEndpoint() {
  if (!settings.apiBase) {
    throw new Error("API 地址不正确");
  }

  let base = settings.apiBase.replace(/\/+$/, "");

  /*
    同时兼容用户输入：
    https://example.com/v1
    https://example.com/v1/models
    https://example.com/v1/chat/completions
  */
  if (/\/chat\/completions$/i.test(base)) {
    base = base.replace(/\/chat\/completions$/i, "");
  }

  if (/\/models$/i.test(base)) {
    return base;
  }

  return base + "/models";
}

function getModelIds(payload) {
  let source = [];

  if (Array.isArray(payload)) {
    source = payload;
  } else if (Array.isArray(payload?.data)) {
    source = payload.data;
  } else if (Array.isArray(payload?.models)) {
    source = payload.models;
  }

  return [
    ...new Set(
      source
        .map((item) => {
          if (typeof item === "string") {
            return item.trim();
          }

          return String(
            item?.id ||
            item?.name ||
            item?.model ||
            ""
          ).trim();
        })
        .filter(Boolean)
    )
  ].sort((a, b) =>
    a.localeCompare(b, undefined, {
      numeric: true,
      sensitivity: "base"
    })
  );
}

function renderModelOptions(models) {
  const select = $("model");
  const previousValue = select.value || settings.model;

  select.replaceChildren();

  models.forEach((model) => {
    const option = document.createElement("option");

    option.value = model;
    option.textContent = model;

    select.appendChild(option);
  });

  if (models.includes(previousValue)) {
    select.value = previousValue;
  } else if (models.length) {
    select.value = models[0];
  }
}

async function loadAvailableModels({
  automatic = false
} = {}) {
  readSettingsForm();

  const result = $("modelResult");
  const button = $("loadModelsButton");
  const apiKey = $("apiKey").value.trim();

  if (!settings.apiBase) {
    result.textContent = "请先填写正确的 API 地址";

    if (!automatic) {
      showToast("请先填写正确的 API 地址", "error");
    }

    return;
  }

  if (!apiKey) {
    result.textContent = "请先填写 API Key";

    if (!automatic) {
      showToast("请先填写 API Key", "error");
    }

    return;
  }

  /*
    输入发生变化时，取消上一次模型请求。
  */
  if (modelLoadController) {
    modelLoadController.abort();
  }

  const controller = new AbortController();

  modelLoadController = controller;
  button.disabled = true;
  button.textContent = "获取中";
  result.textContent = "正在获取可用模型…";

  try {
    const response = await fetch(
      getModelsEndpoint(),
      {
        method: "GET",

        headers: {
          "Accept": "application/json",
          "Authorization": "Bearer " + apiKey
        },

        signal: controller.signal
      }
    );

    const raw = await response.text();

    let payload = {};

    if (raw.trim()) {
      try {
        payload = JSON.parse(raw);
      } catch {
        throw new Error(
          "模型接口没有返回有效的 JSON 数据"
        );
      }
    }

    if (!response.ok) {
      const detail =
        payload?.error?.message ||
        payload?.message ||
        raw ||
        "模型列表请求失败";

      throw new Error(
        `HTTP ${response.status}: ` +
        String(detail).slice(0, 300)
      );
    }

    const models = getModelIds(payload);

    if (!models.length) {
      throw new Error(
        "接口连接成功，但没有返回模型列表"
      );
    }

    renderModelOptions(models);

    const currentModel = $("model").value.trim();

    /*
      当前模型不在服务器列表中时，自动选择第一个。
      用户仍然可以在输入框中手动填写其他模型。
    */
   if (!models.includes(currentModel) && models.length) {
  $("model").value = models[0];
}

    readSettingsForm();
    updateStatus();

    result.textContent =
      `已发现 ${models.length} 个模型，` +
      `当前选择：${settings.model}`;

    showToast(
      `已获取 ${models.length} 个模型`
    );
  } catch (error) {
    if (error.name === "AbortError") {
      return;
    }

    console.warn("获取模型失败：", error);

    result.textContent =
      "获取模型失败：" +
      (error.message || String(error));

    if (!automatic) {
      showToast("获取模型失败", "error");
    }
  } finally {
    if (modelLoadController === controller) {
      modelLoadController = null;
      button.disabled = false;
      button.textContent = "获取模型";
    }
  }
}

function scheduleModelLoading() {
  clearTimeout(modelLoadTimer);

  const base = $("apiBase").value.trim();
  const apiKey = $("apiKey").value.trim();

  if (!base || !apiKey) {
    return;
  }

  /*
    等用户停止输入 900ms 后再请求，
    防止输入 API Key 时连续发送请求。
  */
  modelLoadTimer = setTimeout(() => {
    loadAvailableModels({
      automatic: true
    });
  }, 900);
}

function apiMessages(messages) {
  return messages
    .filter((message) => {
      /*
        streaming 和 error 消息不发送给模型。
      */
      if (message.status === "streaming") {
        return false;
      }

      if (message.status === "error") {
        return false;
      }

      return (
        message.role === "user" ||
        message.role === "assistant"
      );
    })
    .map((message) => ({
      role: message.role,
      content: message.content
    }));
}

async function streamChat(
  messages,
  onText,
  signal
) {
  const apiKey = $("apiKey").value.trim();

  if (!apiKey) {
    throw new Error("请先填写 API Key");
  }

  if (!settings.model) {
    throw new Error("请先填写模型名称");
  }

  const temperature = Number(settings.temperature);

  const body = {
    model: settings.model,
    messages,
    stream: true
  };

  if (Number.isFinite(temperature)) {
    body.temperature = Math.max(0, Math.min(2, temperature));
  }

  const response = await fetch(getEndpoint(), {
    method: "POST",

    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + apiKey
    },

    body: JSON.stringify(body),
    signal
  });

  if (!response.ok) {
    let detail = "";

    try {
      const raw = await response.text();

      try {
        const json = JSON.parse(raw);

        detail =
          json.error?.message ||
          json.message ||
          raw;
      } catch {
        detail = raw;
      }
    } catch {
      detail = "接口请求失败";
    }

    throw new Error(`HTTP ${response.status}\n${String(detail).slice(0, 1000)}`);
  }

  if (!response.body) {
    const json = await response.json();
    const text = contentToText(json.choices?.[0]?.message?.content || "");

    if (text) {
      onText(text);
    }

    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");

  let buffer = "";
  let result = "";

  function processLine(line) {
    const value = line.trim();

    if (!value.startsWith("data:")) {
      return;
    }

    const data = value.slice(5).trim();

    if (!data || data === "[DONE]") {
      return;
    }

    let json;

    try {
      json = JSON.parse(data);
    } catch {
      return;
    }

    const delta = json.choices?.[0]?.delta;
    const part = contentToText(delta?.content || "");

    if (part) {
      result += part;
      onText(result);
    }
  }

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    lines.forEach(processLine);
  }

  if (buffer.trim()) {
    processLine(buffer);
  }

  return result;
}

/* ================= 运行状态 ================= */

function updateRun(
  conversation,
  label,
  progress
) {
  const run = conversation?._run;

  if (!run) {
    return;
  }

  run.label = label;
  run.progress = progress;

  if (currentConversation() !== conversation) {
    return;
  }

  $("runStatus").classList.add("show");
  $("runLabel").textContent = label;

  $("progressBar").style.width =
    Math.max(0, Math.min(100, progress)) + "%";

  const seconds =
    (performance.now() - run.startedAt) / 1000;

  $("runTime").textContent =
    `耗时 ${seconds.toFixed(1)} 秒`;
}

function renderRunPanel() {
  const conversation = currentConversation();
  const run = conversation?._run;

  if (!run || !run.running) {
    $("runStatus").classList.remove("show");
    return;
  }

  updateRun(
    conversation,
    run.label || "正在生成回答",
    run.progress || 20
  );
}

function finishRun(
  conversation,
  label = "生成完成"
) {
  if (currentConversation() !== conversation) {
    return;
  }

  $("runStatus").classList.add("show");
  $("runLabel").textContent = label;
  $("progressBar").style.width = "100%";

  setTimeout(() => {
    if (
      currentConversation() === conversation &&
      !conversation._run
    ) {
      $("runStatus").classList.remove("show");
    }
  }, 1000);
}

function updateSendButton() {
  const button = $("sendButton");
  const conversation = currentConversation();

  const hasContent =
    $("messageInput").value.trim() ||
    state.attachments.length;

  if (conversation?._run?.running) {
    button.disabled = false;
    button.textContent = "停止";
    button.classList.add("stop");
    return;
  }

  button.textContent = "发送";
  button.classList.remove("stop");
  button.disabled = !hasContent;
}

function autoResize() {
  const input = $("messageInput");

  input.style.height = "auto";
  input.style.height =
    Math.min(input.scrollHeight, 180) + "px";
}

/* ================= 删除单条消息 ================= */

function deleteMessage(index) {
  const conversation = currentConversation();

  if (!conversation) {
    return;
  }

  const message = conversation.messages[index];

  if (!message) {
    return;
  }

  const isUserMessage =
    message.role === "user";

  const confirmText = isUserMessage
    ? "删除这个问题时，也会删除它对应的回答，确定继续吗？"
    : "确定删除这个回答吗？";

  if (!confirm(confirmText)) {
    return;
  }

  /*
    删除任何消息时，如果当前对话正在回答，
    先停止当前回答，避免请求和历史记录不一致。
  */
  if (conversation._run?.running) {
    cancelConversationRun(
      conversation,
      "delete-message"
    );

    conversation._run = null;

    conversation.messages =
      conversation.messages.filter(
        (item) => item.status !== "streaming"
      );
  }

  const removeIndexes = [index];

  /*
    删除用户问题时，自动删除紧跟着的 assistant 回答。
  */
  if (
    isUserMessage &&
    conversation.messages[index + 1]?.role ===
      "assistant"
  ) {
    removeIndexes.push(index + 1);
  }

  conversation.messages =
    conversation.messages.filter(
      (_, messageIndex) =>
        !removeIndexes.includes(messageIndex)
    );

  conversation.updatedAt = Date.now();

  persistConversations();
  renderHistory();
  renderMessages();
  updateConversationName();
  updateSendButton();
}

/* ================= 发送与回答 ================= */

async function runConversation(conversation) {
  if (conversation._run?.running) {
    return;
  }

  const lastUserMessage =
    [...conversation.messages]
      .reverse()
      .find(
        (message) => message.role === "user"
      );

  const pendingMessage = {
    id: uid(),
    role: "assistant",
    content: "",
    status: "streaming",
    replyTo: lastUserMessage?.id || ""
  };

  conversation.messages.push(pendingMessage);

  const run = {
    running: true,
    controller: new AbortController(),
    startedAt: performance.now(),
    pendingId: pendingMessage.id,
    cancelReason: "",
    label: "正在连接模型",
    progress: 10
  };

  conversation._run = run;

  renderMessages();
  updateSendButton();
  renderHistory();

  let timer = null;

  try {
    const requestMessages = [];

    if (settings.systemPrompt.trim()) {
      requestMessages.push({
        role: "system",
        content: settings.systemPrompt
      });
    }

    requestMessages.push(
      ...apiMessages(conversation.messages)
    );

    timer = setInterval(() => {
      if (
        conversation._run !== run ||
        !run.running
      ) {
        return;
      }

      updateRun(
        conversation,
        pendingMessage.content
          ? "模型生成中"
          : "正在等待模型响应",
        pendingMessage.content ? 55 : 20
      );
    }, 250);

    const result = await streamChat(
      requestMessages,
      (text) => {
        /*
          如果这个请求已经被删除、清空或终止，
          就不再写回界面。
        */
        if (conversation._run !== run) {
          return;
        }

        pendingMessage.content = text;

        if (
          currentConversation() === conversation
        ) {
          renderMessages(false);
        }

        scrollBottom();
      },
      run.controller.signal
    );

    if (conversation._run !== run) {
      return;
    }

    pendingMessage.content =
      result || "（模型没有返回内容）";

    delete pendingMessage.status;
    delete pendingMessage.replyTo;

    conversation._run = null;
    conversation.updatedAt = Date.now();

    persistConversations();

    if (
      currentConversation() === conversation
    ) {
      renderMessages();
    }

    renderHistory();
    finishRun(conversation, "生成完成");
  } catch (error) {
    if (conversation._run !== run) {
      return;
    }

    const pendingIndex =
      conversation.messages.findIndex(
        (message) =>
          message.id === run.pendingId
      );

    const silentlyRemove =
      run.cancelReason ===
        "delete-conversation" ||
      run.cancelReason ===
        "clear-conversation" ||
      run.cancelReason ===
        "delete-message";

    if (silentlyRemove) {
      if (pendingIndex >= 0) {
        conversation.messages.splice(
          pendingIndex,
          1
        );
      }
    } else {
      if (pendingIndex >= 0) {
        const pending =
          conversation.messages[pendingIndex];

        pending.status = "error";

        pending.content =
          error.name === "AbortError"
            ? "已停止生成"
            : `⚠ ${error.message || String(error)}`;

        delete pending.replyTo;
      }
    }

    conversation._run = null;
    conversation.updatedAt = Date.now();

    persistConversations();

    if (
      currentConversation() === conversation
    ) {
      renderMessages();
    }

    renderHistory();

    finishRun(
      conversation,
      error.name === "AbortError"
        ? "已停止"
        : "请求失败"
    );
  } finally {
    if (timer) {
      clearInterval(timer);
    }

    if (conversation._run === run) {
      conversation._run = null;
    }

    updateSendButton();
    renderRunPanel();
  }
}

async function sendMessage() {
  const conversation = currentConversation();

  if (!conversation) {
    return;
  }

  /*
    当前对话正在回答时，发送按钮变为停止按钮。
  */
  if (conversation._run?.running) {
    cancelConversationRun(
      conversation,
      "stop"
    );

    return;
  }

  readSettingsForm();
  saveSettings();

  if (!settings.apiBase) {
    showToast(
      "请先填写正确的 API 地址",
      "error"
    );

    openSettings();
    return;
  }

  if (!$("apiKey").value.trim()) {
    showToast(
      "请先填写 API Key",
      "error"
    );

    openSettings();
    return;
  }

  const text = $("messageInput").value.trim();
  const attachments = [...state.attachments];

  if (!text && !attachments.length) {
    return;
  }

  const userMessage = buildUserMessage(
    text,
    attachments
  );

  conversation.messages.push(userMessage);

  if (conversation.title === "新对话") {
    conversation.title =
      text.slice(0, 25) ||
      attachments[0]?.name ||
      "新对话";
  }

  conversation.updatedAt = Date.now();

  $("messageInput").value = "";
  state.attachments = [];

  autoResize();
  renderAttachments();

  persistConversations();
  renderHistory();
  renderMessages();
  updateConversationName();

  await runConversation(conversation);
}

async function regenerate(index) {
  const conversation = currentConversation();

  if (!conversation) {
    return;
  }

  if (conversation._run?.running) {
    showToast(
      "当前对话正在生成，请先停止",
      "error"
    );

    return;
  }

  const message = conversation.messages[index];

  if (
    !message ||
    message.role !== "assistant"
  ) {
    return;
  }

  let userIndex = index - 1;

  while (
    userIndex >= 0 &&
    conversation.messages[userIndex].role !==
      "user"
  ) {
    userIndex--;
  }

  if (userIndex < 0) {
    return;
  }

  conversation.messages =
    conversation.messages.slice(
      0,
      userIndex + 1
    );

  conversation.updatedAt = Date.now();

  persistConversations();
  renderMessages();
  renderHistory();

  await runConversation(conversation);
}

/* ================= LaTeX 导出 ================= */

function latexEscape(value) {
  const replacements = {
    "\\": "\\textbackslash{}",
    "{": "\\{",
    "}": "\\}",
    "%": "\\%",
    "&": "\\&",
    "#": "\\#",
    "_": "\\_",
    "$": "\\$",
    "^": "\\textasciicircum{}",
    "~": "\\textasciitilde{}"
  };

  return [...String(value ?? "")]
    .map((char) => replacements[char] || char)
    .join("");
}

function normalizeLatexFormula(formula) {
  const value = String(formula || "").trim();

  if (value.startsWith("$$") && value.endsWith("$$")) {
    return "\\[\n" + value.slice(2, -2).trim() + "\n\\]";
  }

  if (value.startsWith("\\[") && value.endsWith("\\]")) {
    return value;
  }

  if (value.startsWith("\\(") && value.endsWith("\\)")) {
    return value;
  }

  if (value.startsWith("$") && value.endsWith("$")) {
    return "\\(" + value.slice(1, -1).trim() + "\\)";
  }

  return value;
}

function markdownToLatex(source) {
  let text = String(source || "");

  const codeBlocks = [];
  const formulas = [];

  text = text.replace(
    /```([\w+#.-]*)[ \t]*\r?\n?([\s\S]*?)(?:```|$)/g,
    (_, language, code) => {
      const index = codeBlocks.length;

      codeBlocks.push({
        language: language || "text",
        code: code.replace(/\n$/, "")
      });

      return `CODETOKEN${index}END`;
    }
  );

  text = text.replace(
    /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$[^$\n]+\$)/g,
    (formula) => {
      const index = formulas.length;

      formulas.push(formula);

      return `MATHTOKEN${index}END`;
    }
  );

  function restoreFormulas(value) {
    let result = value;

    formulas.forEach((formula, index) => {
      result = result
        .split(`MATHTOKEN${index}END`)
        .join(normalizeLatexFormula(formula));
    });

    return result;
  }

  function latexInline(value) {
    let raw = String(value || "");

    raw = raw.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1 ($2)");

    let escaped = latexEscape(raw);

    escaped = escaped.replace(
      /`([^`]+)`/g,
      "\\texttt{$1}"
    );

    escaped = escaped.replace(
      /\*\*([^*]+)\*\*/g,
      "\\textbf{$1}"
    );

    return restoreFormulas(escaped);
  }

  const output = [];
  let listType = null;

  function closeList() {
    if (listType === "ul") {
      output.push("\\end{itemize}");
    }

    if (listType === "ol") {
      output.push("\\end{enumerate}");
    }

    listType = null;
  }

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();

    if (!line) {
      closeList();
      output.push("");
      continue;
    }

    const codeMatch = line.match(/^CODETOKEN(\d+)END$/);

    if (codeMatch) {
      closeList();

      const block = codeBlocks[Number(codeMatch[1])];

      output.push(
        "\\begin{verbatim}\n" +
        block.code +
        "\n\\end{verbatim}"
      );

      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);

    if (heading) {
      closeList();

      const level = heading[1].length;

      const command =
        level === 1
          ? "section"
          : level === 2
            ? "subsection"
            : "subsubsection";

      output.push(`\\${command}{${latexInline(heading[2])}}`);
      continue;
    }

    const unordered = line.match(/^[-*+]\s+(.+)$/);

    if (unordered) {
      if (listType !== "ul") {
        closeList();
        output.push("\\begin{itemize}");
        listType = "ul";
      }

      output.push(`\\item ${latexInline(unordered[1])}`);
      continue;
    }

    const ordered = line.match(/^\d+[.)]\s+(.+)$/);

    if (ordered) {
      if (listType !== "ol") {
        closeList();
        output.push("\\begin{enumerate}");
        listType = "ol";
      }

      output.push(`\\item ${latexInline(ordered[1])}`);
      continue;
    }

    closeList();
    output.push(latexInline(line));
  }

  closeList();

  const body = output.join("\n");

  return `\\documentclass[UTF8]{ctexart}
\\usepackage{amsmath}
\\usepackage{amssymb}
\\usepackage{mathtools}
\\usepackage{bm}
\\usepackage{geometry}
\\usepackage{xcolor}
\\usepackage{hyperref}

\\geometry{a4paper,margin=2.2cm}

\\hypersetup{
  colorlinks=true,
  linkcolor=blue,
  urlcolor=blue
}

\\title{Marco Agent 回答}
\\date{\\today}

\\begin{document}

\\maketitle

${body}

\\end{document}
`;
}

function safeFilename(name) {
  return String(name || "marco-agent")
    .replace(/[\\/:*?"<>|]/g, "_")
    .slice(0, 80);
}

function downloadText(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

function exportMessageToLatex(index) {
  const conversation = currentConversation();

  if (!conversation) {
    return;
  }

  const message = conversation.messages[index];

  if (!message || message.role !== "assistant") {
    return;
  }

  const content = contentToText(message.content);
  const latex = markdownToLatex(content);

  const filename =
    safeFilename(conversation.title) +
    "-answer.tex";

  downloadText(
    filename,
    latex,
    "application/x-tex;charset=utf-8"
  );

  showToast("LaTeX 文件已导出，请用 XeLaTeX 编译");
}

/* ================= 侧栏与界面 ================= */

function openSettings() {
  if (window.innerWidth <= 900) {
    $("sidebar").classList.add("open");
  } else {
    document.body.classList.remove("sidebar-hidden");
  }

  switchTab("settings");
}

function closeSidebarOnMobile() {
  if (window.innerWidth <= 900) {
    $("sidebar").classList.remove("open");
  }
}

function switchTab(name) {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.tab === name);
  });

  document.querySelectorAll(".panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === "panel-" + name);
  });
}

async function testConnection() {
  readSettingsForm();
  saveSettings();

  const result = $("testResult");
  result.textContent = "测试中…";

  try {
    const response = await fetch(getEndpoint(), {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + $("apiKey").value.trim()
      },

      body: JSON.stringify({
        model: settings.model,
        messages: [
          {
            role: "user",
            content: "Reply with OK"
          }
        ],
        max_tokens: 5,
        stream: false
      })
    });

    if (response.ok) {
      result.textContent = "✓ 连接成功";
    } else {
      const text = await response.text();
      result.textContent =
        `× HTTP ${response.status}: ` +
        text.slice(0, 300);
    }
  } catch (error) {
    result.textContent = "× " + error.message;
  }
}

function setupEvents() {
  $("menuButton").onclick = () => {
    if (window.innerWidth <= 900) {
      $("sidebar").classList.toggle("open");
    } else {
      document.body.classList.toggle("sidebar-hidden");
    }
  };

  $("closeSidebar").onclick = () => {
    $("sidebar").classList.remove("open");

    if (window.innerWidth > 900) {
      document.body.classList.add("sidebar-hidden");
    }
  };

  $("newConversationButton").onclick = createNewConversation;
  $("topNewConversationButton").onclick = createNewConversation;
  $("clearCurrentButton").onclick = clearCurrentConversation;

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.onclick = () => {
      switchTab(tab.dataset.tab);
    };
  });

  $("historySearch").oninput = renderHistory;

  $("historyList").onclick = (event) => {
    const item = event.target.closest(".history-item");

    if (!item) {
      return;
    }

    const id = item.dataset.id;

    if (event.target.closest(".history-delete")) {
      deleteConversation(id);
    } else {
      switchConversation(id);
    }
  };

  $("saveSettingsButton").onclick = () => {
    if (saveSettings()) {
      showToast("设置已保存");
    }
  };

  [
  "apiBase",
  "apiKey",
  "model",
  "temperature",
  "systemPrompt",
  "rememberApiKey"
].forEach((id) => {
  $(id).addEventListener("input", () => {
    readSettingsForm();
    updateStatus();

    if (id === "apiBase" || id === "apiKey") {
      scheduleModelLoading();
    }
  });

  $(id).addEventListener("change", () => {
    readSettingsForm();
    updateStatus();

    if (id === "apiBase" || id === "apiKey") {
      scheduleModelLoading();
    }
  });
});

$("loadModelsButton").onclick = () => {
  loadAvailableModels();
};

  $("testConnectionButton").onclick = testConnection;

  $("clearAllButton").onclick = () => {
  if (!confirm("确定清空全部历史对话吗？")) {
    return;
  }

  state.conversations.forEach((conversation) => {
    cancelConversationRun(
      conversation,
      "clear-conversation"
    );

    conversation._run = null;
  });

  const fresh = createConversationData();

  state.conversations = [fresh];
  state.currentId = fresh.id;

  resetComposer();

  persistConversations();
  renderHistory();
  renderMessages();
  updateConversationName();

  showToast("已清空全部历史对话");
};

  $("sendButton").onclick = sendMessage;

  $("messageInput").oninput = () => {
    autoResize();
    updateSendButton();
  };

  $("messageInput").onkeydown = (event) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.isComposing
    ) {
      event.preventDefault();
      sendMessage();
    }
  };

  $("imageButton").onclick = () => {
    $("imageInput").click();
  };

  $("fileButton").onclick = () => {
    $("fileInput").click();
  };

  $("imageInput").onchange = (event) => {
    addFiles(event.target.files);
    event.target.value = "";
  };

  $("fileInput").onchange = (event) => {
    addFiles(event.target.files);
    event.target.value = "";
  };

  $("attachments").onclick = (event) => {
    const button = event.target.closest(".remove-attachment");

    if (!button) {
      return;
    }

    const index = Number(button.dataset.index);

    state.attachments.splice(index, 1);
    renderAttachments();
  };

  $("messageInput").onpaste = (event) => {
    const files = Array.from(event.clipboardData?.files || []);
    const images = files.filter((file) => file.type.startsWith("image/"));

    if (images.length) {
      event.preventDefault();
      addFiles(images);
    }
  };

  $("chatInner").onclick = (event) => {
    const copyCodeButton = event.target.closest(".copy-code");

    if (copyCodeButton) {
      const code =
        copyCodeButton
          .closest(".code-block")
          ?.querySelector("code")
          ?.textContent || "";

      copyText(code).then(() => {
        copyCodeButton.textContent = "已复制";

        setTimeout(() => {
          copyCodeButton.textContent = "复制";
        }, 1200);
      });

      return;
    }

    const action = event.target.closest("[data-action]");

    if (action) {
      const index = Number(action.dataset.index);

      if (action.dataset.action === "copy") {
        const conversation = currentConversation();
        const message = conversation?.messages[index];

        if (message) {
          copyText(contentToText(message.content)).then(() => {
            showToast("回答已复制");
          });
        }

        return;
      }

      if (action.dataset.action === "latex") {
        exportMessageToLatex(index);
        return;
      }

      if (action.dataset.action === "regenerate") {
        regenerate(index);
        return;
      }
     if (
      action.dataset.action === "delete-message"
    ) {
  deleteMessage(index);
  return;
}
    }

    const fileHeader = event.target.closest(".message-file-header");

    if (fileHeader) {
      fileHeader
        .closest(".message-file")
        ?.classList.toggle("open");

      return;
    }

    const image = event.target.closest(".message-images img");

    if (image) {
      const lightbox = document.createElement("div");

      lightbox.className = "lightbox";

      const largeImage = document.createElement("img");

      largeImage.src = image.src;
      largeImage.alt = image.alt;

      lightbox.appendChild(largeImage);

      lightbox.onclick = () => {
        lightbox.remove();
      };

      document.body.appendChild(lightbox);
    }
  };

  let dragDepth = 0;

  window.addEventListener("dragenter", (event) => {
    if (!Array.from(event.dataTransfer?.types || []).includes("Files")) {
      return;
    }

    dragDepth++;
    $("dropOverlay").classList.add("show");
  });

  window.addEventListener("dragover", (event) => {
    if (Array.from(event.dataTransfer?.types || []).includes("Files")) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    }
  });

  window.addEventListener("dragleave", () => {
    dragDepth = Math.max(0, dragDepth - 1);

    if (!dragDepth) {
      $("dropOverlay").classList.remove("show");
    }
  });

  window.addEventListener("drop", (event) => {
    if (!event.dataTransfer?.files?.length) {
      return;
    }

    event.preventDefault();

    dragDepth = 0;
    $("dropOverlay").classList.remove("show");

    addFiles(event.dataTransfer.files);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      document.querySelector(".lightbox")?.remove();
    }
  });
}

/* ================= 初始化 ================= */

function init() {
  loadSettings();
  setInitialModel();
  loadConversations();

  renderHistory();
  renderMessages();
  updateConversationName();
  renderAttachments();
  updateSendButton();
  setupEvents();

  autoResize();

  if (!$("apiKey").value.trim()) {
    setTimeout(() => {
      openSettings();
    }, 300);
  }

   if (
  $("apiBase").value.trim() &&
  $("apiKey").value.trim()
) {
  scheduleModelLoading();
}

  $("messageInput").focus();
}

init();
