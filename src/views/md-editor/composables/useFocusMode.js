import { ref } from 'vue';

const FOCUS_SELECTOR = 'p, h1, h2, h3, h4, li, blockquote';

export function useFocusMode() {
    const focusMode = ref(false);
    let focusRafId = null;

    function updateFocusedElement() {
        const content = document.querySelector('.fullscreen-content');
        if (!content) return;
        const els = Array.from(content.querySelectorAll(FOCUS_SELECTOR));
        const viewMid = content.getBoundingClientRect().top + content.clientHeight / 2;

        let closestIdx = 0, closestDist = Infinity;
        for (let i = 0; i < els.length; i++) {
            const r = els[i].getBoundingClientRect();
            const dist = Math.abs(r.top + r.height / 2 - viewMid);
            if (dist < closestDist) { closestDist = dist; closestIdx = i; }
        }

        const activeSet = new Set(els.slice(Math.max(0, closestIdx - 2), closestIdx + 3));
        for (const el of els) el.classList.toggle('focus-active', activeSet.has(el));
    }

    function onContentScrollFocus() {
        if (!focusMode.value) return;
        if (focusRafId) cancelAnimationFrame(focusRafId);
        focusRafId = requestAnimationFrame(updateFocusedElement);
    }

    function toggleFocusMode() {
        focusMode.value = !focusMode.value;
        const content = document.querySelector('.fullscreen-content');
        if (!content) return;
        if (focusMode.value) {
            content.classList.add('focus-mode');
            updateFocusedElement();
        } else {
            content.classList.remove('focus-mode');
            content.querySelectorAll('.focus-active').forEach(el => el.classList.remove('focus-active'));
        }
    }

    return { focusMode, toggleFocusMode, updateFocusedElement, onContentScrollFocus };
}
