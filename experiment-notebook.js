/* Optional, source-authored notebook versions. No rewriting or AI calls in the reader. */
(function () {
    'use strict';
    if (window.AlmanionExperiments) return;
    const selector = '.experiment-box, [data-experiment]';
    const controls = 'button,input,textarea,select,summary,[contenteditable="true"],.note-inline-editor';
    const drawings = 'figure,picture,img,svg,canvas,object,embed,iframe';
    const states = new WeakMap();
    let pointer = null, streak = null;

    function isDrawing(node) {
        return node.nodeType === 1 && node.matches(drawings) && !node.closest('.katex');
    }
    function protectedNode(node) {
        return node.nodeType === 1 && (isDrawing(node) || node.matches(controls));
    }
    function containsProtected(node) {
        return node.nodeType === 1 && Array.from(node.querySelectorAll(drawings + ',' + controls)).some(protectedNode);
    }
    function notebookContent(text) {
        const body = document.createElement('div');
        body.className = 'experiment-notebook';
        // Only text and math delimiters are accepted. HTML can never execute here.
        for (const paragraph of text.trim().split(/\n\s*\n/)) {
            const p = document.createElement('p');
            paragraph.split('\n').forEach((line, index) => {
                if (index) p.append(document.createElement('br'));
                p.append(document.createTextNode(line));
            });
            body.append(p);
        }
        return body;
    }
    function renderMath(body) {
        if (typeof window.renderMathInElement !== 'function') return;
        window.renderMathInElement(body, {throwOnError:false, trust:false, delimiters:[
            {left:'\\[',right:'\\]',display:true}, {left:'\\(',right:'\\)',display:false}
        ]});
    }
    function restore(block) {
        const state = states.get(block);
        if (!state?.active) return false;
        block.querySelectorAll(selector).forEach(restore);
        state.body.remove();
        for (const slot of state.slots) slot.anchor.replaceWith(slot.node);
        state.slots = []; state.active = false;
        delete block.dataset.experimentMode;
        block.dispatchEvent(new CustomEvent('almanion:experiment-changed', {bubbles:true,detail:{block,notebook:false}}));
        return true;
    }
    function toggle(block) {
        if (!block?.matches(selector)) return false;
        if (restore(block)) return true;
        const text = block.getAttribute('data-experiment-notebook') || '';
        if (!text.trim()) return false;
        // Restore nested variants first, so the original never contains another alternate view.
        block.querySelectorAll(selector).forEach(restore);
        let state = states.get(block);
        if (!state || state.text !== text) {
            state = {text,body:notebookContent(text),slots:[],active:false,prepared:false};
            states.set(block,state);
        }
        function hideText(parent) {
            const children = Array.from(parent.childNodes);
            for (const [index,node] of children.entries()) {
                // On watches, keep image zoom buttons but hide zoom buttons of replaced formulas.
                const formulaZoom = node.nodeType === 1 && node.matches('.watch-magnify') &&
                    children[index - 1]?.nodeType === 1 && children[index - 1].matches('.watch-scroll');
                if (protectedNode(node) && !formulaZoom) continue;
                if (containsProtected(node) && !formulaZoom) { hideText(node); continue; }
                const anchor = document.createComment('experiment-original');
                node.replaceWith(anchor); state.slots.push({node,anchor});
            }
        }
        hideText(block);
        block.prepend(state.body); state.active = true;
        block.dataset.experimentMode = 'notebook';
        renderMath(state.body);
        const first = !state.prepared; state.prepared = true;
        block.dispatchEvent(new CustomEvent('almanion:experiment-changed', {bubbles:true,detail:{block,content:state.body,notebook:true,first}}));
        return true;
    }
    function candidate(target) {
        if (!target?.closest || target.closest(controls + ',a,' + drawings + ',.katex')) return null;
        const block = target.closest(selector);
        return block?.closest('main,.main-content') ? block : null;
    }
    document.addEventListener('pointerdown', function (event) {
        if (event.target.closest?.('.note-inline-edit-button')) {
            const scope = event.target.closest(selector) || event.target.closest('.topic,.content-section');
            if (scope) { restore(scope); scope.querySelectorAll(selector).forEach(restore); }
        }
        const block = candidate(event.target);
        if (!block || event.button !== 0 || !event.isPrimary) { pointer = streak = null; return; }
        pointer = {id:event.pointerId,block,x:event.clientX,y:event.clientY,time:performance.now(),valid:true};
    }, true);
    document.addEventListener('pointermove', function (event) {
        if (pointer?.id === event.pointerId && Math.hypot(event.clientX-pointer.x,event.clientY-pointer.y) > 12) {
            pointer.valid = false; streak = null;
        }
    }, {capture:true,passive:true});
    document.addEventListener('pointercancel', () => { pointer = streak = null; }, true);
    document.addEventListener('touchstart', event => {
        if (event.touches.length > 1) pointer = streak = null;
    }, {capture:true,passive:true});
    document.addEventListener('click', function (event) {
        const block = candidate(event.target), now = performance.now();
        if (!block || !pointer?.valid || pointer.block !== block || now-pointer.time > 650) { streak = null; return; }
        pointer = null;
        if (!streak || streak.block !== block || now-streak.time > 450 || now-streak.start > 1000 || Math.hypot(event.clientX-streak.x,event.clientY-streak.y) > 24) {
            streak = {block,count:0,start:now,x:event.clientX,y:event.clientY};
        }
        streak.time = now; streak.count++;
        if (streak.count !== 3) return;
        streak = null;
        if (toggle(block)) { event.preventDefault(); window.getSelection()?.removeAllRanges(); }
    }, true);
    // Manipulation disables double-tap zoom only here; pinch zoom and native scrolling remain available.
    const style = document.createElement('style');
    style.textContent = '[data-experiment-notebook]{touch-action:manipulation}.experiment-notebook > p:first-child{margin-top:0}.experiment-notebook > p:last-child{margin-bottom:0}';
    document.head.append(style);
    window.AlmanionExperiments = Object.freeze({toggle,restore,renderMath});
})();
