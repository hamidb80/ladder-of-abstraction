function assignKeys(items) {
    for (const i of items) {
        i.key = "L" + i.line + ":i" + i.indent
        assignKeys(i.children)
    }
}
assignKeys(window.DATA)

/**
 * damn simple markdown parser to avoid buggy JS libs
 * @param {markdown code} src 
 * @returns HTML represenatation
 */
function linear_MD_parser(src) {
    const RULES = [
        // order matters if a longer delimiter shares a prefix with a shorter one
        { start: "`", re: /`([^`]+)`/y, type: "code", raw: true },
        { start: "$", re: /\$([^$]+)\$/y, type: "math", raw: true },
        { start: "**", re: /\*\*(.+?)\*\*/y, type: "bold" },
        { start: "==", re: /==(.+?)==/y, type: "highlight" },
        { start: "_", re: /_([^_]+)_/y, type: "italic" },
    ]

    const out = []
    let text = ""
    let i = 0

    const flush = () => {
        if (text) {
            out.push({ type: "text", value: text })
            text = ""
        }
    }

    while (i < src.length) {
        const ch = src[i]

        if (ch === "\\") {
            text += i + 1 < src.length ? src[++i] : "\\"
            i++
            continue
        }

        const rule = RULES.find(r => src.startsWith(r.start, i))
        if (rule) {
            rule.re.lastIndex = i
            const m = rule.re.exec(src)
            if (m) {
                flush()
                const value = rule.raw ? m[1] : m[1].replace(/\\(.)/g, "$1")
                out.push({ type: rule.type, value })
                i += m[0].length
                continue
            }
            // prefix present but no closer (e.g. "**a" or "==b") → literal
        }

        text += ch
        i++
    }

    flush()
    return out
}

function app() {
    return {
        MAX_LEVEL: window.MAX_LEVEL,
        FILE_PATH: window.FILE_PATH,
        DATA: window.DATA,
        minLevel: 0,

        init() {
            // Re-render math once after Alpine's initial paint.
            this.$nextTick(() => this.renderMath(document.getElementById("comments")))
        },

        get totalCount() {
            let n = 0
            const walk = items => {
                for (const i of items) {
                    n++
                    walk(i.children)
                }
            }
            walk(this.DATA)
            return n
        },

        get visibleRoots() {
            return this.DATA.filter(i => i.effective_level >= this.minLevel)
        },

        get footerText() {
            let hidden = 0,
                total = 0
            const walk = items => {
                for (const n of items) {
                    total++
                    if (n.effective_level < this.minLevel) hidden++
                    walk(n.children)
                }
            }
            walk(this.DATA)
            return hidden === 0 ? total + " comment(s) shown." : hidden + " of " + total + " comment(s) hidden (below min level). Lower the slider to reveal."
        },

        visible(item) {
            return item.effective_level >= this.minLevel
        },

        setAllCollapsed(collapsed) {
            // Every node component listens to this flag.
            this.$dispatch("set-collapsed", { collapsed })
        },

        renderMath(el) {
            if (el && window.renderMathInElement) {
                window.renderMathInElement(el, {
                    delimiters: [
                        { left: "$$", right: "$$", display: true },
                        { left: "$", right: "$", display: false },
                    ],
                    throwOnError: false,
                    ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code"],
                })
            }
        },

        open(line) {
            let p = window.FILE_PATH.replace(/\\\\/g, "/")
            if (/^[A-Za-z]:/.test(p)) p = "/" + p[0].toLowerCase() + p.slice(1)
            window.location.href = "vscode://file" + p + ":" + line
        },
    }
}

function node(item, root) {
    return {
        item,
        root,
        collapsed: false,
        get kids() {
            return item.children.filter(c => c.effective_level >= root.minLevel)
        },
        get md() {
            const escapeHtml = x => x
            const result = linear_MD_parser(item.comment)
                .map(it => {
                    if (it.type === "text") return `<span>${escapeHtml(it.value)}</span>`
                    if (it.type === "code") return `<code>${escapeHtml(it.value)}</code>`
                    if (it.type === "bold") return `<strong>${escapeHtml(it.value)}</strong>`
                    if (it.type === "highlight") return `<mark>${escapeHtml(it.value)}</mark>`
                    if (it.type === "italic") return `<em>${escapeHtml(it.value)}</em>`
                    if (it.type === "math") return katex.renderToString(it.value, { throwOnError: false })
                })
                .join("")

            console.log(result)
            return result
        },
        get caretHtml() {
            if (!this.kids.length) return ""
            if (this.collapsed) return "&#9654;<span class='badge'>" + this.countDescendants() + "</span>"
            return "\u25BC"
        },
        countDescendants() {
            let n = 0
            const walk = items => {
                for (const c of items) {
                    if (c.effective_level < root.minLevel) continue
                    n++
                    walk(c.children)
                }
            }
            walk(item.children)
            return n
        },
        init() {
            this.$el.innerHTML = document.getElementById("node-template").innerHTML
            Alpine.initTree(this.$el)
            this.$nextTick(() => root.renderMath(this.$el))

            // Global collapse-all listener
            this.$root.addEventListener("set-collapsed", e => {
                if (this.kids.length) this.collapsed = e.detail.collapsed
            })
        },
    }
}
