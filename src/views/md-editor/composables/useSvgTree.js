import { ref, computed, shallowRef, triggerRef } from 'vue';

export const NODE_W = 200;
export const NODE_H = 36;
const V_GAP = 16;
const INDENT = 230;

let _nodeId = 0;

function splitComment(str) {
    const idx = str.indexOf('#');
    if (idx === -1) return [str.trim(), ''];
    return [str.slice(0, idx).trim(), str.slice(idx + 1).trim()];
}

function makeNode(name, comment, parent) {
    const [n, c] = splitComment(name);
    return {
        id: _nodeId++,
        name: n.length > 24 ? n.slice(0, 22) + '…' : n,
        fullName: n,
        comment: comment || c,
        children: [],
        collapsed: false,
        isFolder: n.endsWith('/'),
        parent,
        x: 0, y: 0,
    };
}

function parseAsciiTree(text) {
    _nodeId = 0;
    const lines = text.split('\n').filter(l => l.trim());
    const root = makeNode('root', '', null);
    root.isFolder = true;
    const stack = [{ node: root, depth: -1 }];

    for (const line of lines) {
        const m = line.match(/^((?:[│|]\s{0,3}|\s{4})*)([├└╠╚](?:──|--)\s*)(.+)$/u);
        if (!m) {
            const [n, c] = splitComment(line.trim());
            root.name = n.length > 24 ? n.slice(0, 22) + '…' : n;
            root.fullName = n;
            root.comment = c;
            root.isFolder = n.endsWith('/');
            continue;
        }
        const depth = m[1].length > 0 ? Math.round(m[1].length / 4) : 0;
        const node = makeNode(m[3].trim(), '', null);
        while (stack.length > 1 && stack[stack.length - 1].depth >= depth) stack.pop();
        const parent = stack[stack.length - 1].node;
        node.parent = parent;
        parent.children.push(node);
        stack.push({ node, depth });
    }
    return root;
}

function layoutTree(node, depth, yStart) {
    node.x = depth * INDENT + 20;
    node.y = yStart;
    if (node.collapsed || node.children.length === 0) return yStart + NODE_H + V_GAP;
    let y = yStart + NODE_H + V_GAP;
    for (const child of node.children) y = layoutTree(child, depth + 1, y);
    return y;
}

function flattenVisible(node, result = []) {
    result.push(node);
    if (!node.collapsed) for (const c of node.children) flattenVisible(c, result);
    return result;
}

export function useSvgTree() {
    const treeModalOpen = ref(false);
    const treeData = shallowRef(null);
    const treePan = ref({ x: 0, y: 0 });
    const treeScale = ref(1);
    const treeIsPanning = ref(false);
    const treeSvgSize = ref({ w: 800, h: 600 });

    const treeTransform = computed(() =>
        `translate(${treePan.value.x}px, ${treePan.value.y}px) scale(${treeScale.value})`
    );

    const treeRenderData = computed(() => {
        const tree = treeData.value;
        if (!tree) return { nodes: [], edges: [] };
        const nodes = flattenVisible(tree);
        const edges = [];
        for (const node of nodes) {
            if (!node.parent) continue;
            const p = node.parent;
            edges.push({ id: node.id, x1: p.x + NODE_W, y1: p.y + NODE_H / 2, x2: node.x, y2: node.y + NODE_H / 2 });
        }
        return { nodes, edges };
    });

    function openTreeModal(code) {
        const tree = parseAsciiTree(code);
        layoutTree(tree, 0, 20);
        const nodes = flattenVisible(tree);
        treeData.value = tree;
        treeSvgSize.value = { w: Math.max(...nodes.map(n => n.x + NODE_W)) + 60, h: Math.max(...nodes.map(n => n.y + NODE_H)) + 40 };
        treePan.value = { x: 0, y: 0 };
        treeScale.value = 1;
        treeModalOpen.value = true;
    }

    function toggleTreeNode(node) {
        if (node.children.length === 0) return;
        node.collapsed = !node.collapsed;
        layoutTree(treeData.value, 0, 20);
        const nodes = flattenVisible(treeData.value);
        treeSvgSize.value = { w: Math.max(...nodes.map(n => n.x + NODE_W)) + 60, h: Math.max(...nodes.map(n => n.y + NODE_H)) + 40 };
        triggerRef(treeData);
    }

    function resetTreeView() { treePan.value = { x: 0, y: 0 }; treeScale.value = 1; }

    function onTreeWheel(e) {
        const factor = e.deltaY < 0 ? 1.12 : 0.9;
        treeScale.value = Math.max(0.15, Math.min(5, treeScale.value * factor));
    }

    function onTreePanStart(e) {
        if (e.button !== 0) return;
        treeIsPanning.value = true;
        const startX = e.clientX, startY = e.clientY;
        const startPanX = treePan.value.x, startPanY = treePan.value.y;
        function onMove(ev) { treePan.value = { x: startPanX + ev.clientX - startX, y: startPanY + ev.clientY - startY }; }
        function onUp() { treeIsPanning.value = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); }
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }

    return { treeModalOpen, treeData, treePan, treeScale, treeIsPanning, treeSvgSize, treeTransform, treeRenderData, openTreeModal, toggleTreeNode, resetTreeView, onTreeWheel, onTreePanStart };
}
