// SPDX-License-Identifier: GPL-2.0-or-later

import Meta from 'gi://Meta';

const TRACKED_TYPES = new Set([
    Meta.WindowType.NORMAL,
    Meta.WindowType.DIALOG,
    Meta.WindowType.MODAL_DIALOG,
]);

export function isTracked(win) {
    return TRACKED_TYPES.has(win.get_window_type()) &&
        !win.is_override_redirect();
}

export function isVisible(win) {
    return isTracked(win) && !win.minimized && win.showing_on_its_workspace() &&
        win.located_on_workspace(global.workspace_manager.get_active_workspace());
}

export function rectContains(rect, [x, y]) {
    return x >= rect.x && x < rect.x + rect.width &&
        y >= rect.y && y < rect.y + rect.height;
}

// Pointer position as fractions of a window rect
export function fractionIn(rect, [x, y]) {
    return [(x - rect.x) / rect.width, (y - rect.y) / rect.height];
}

// Topmost visible window whose rect (as given by rectOf) contains the pointer
export function windowAt(pointer, rectOf = win => win.get_frame_rect()) {
    const windows = global.display.sort_windows_by_stacking(
        global.display.list_all_windows().filter(isVisible));
    for (let i = windows.length - 1; i >= 0; i--) {
        const rect = rectOf(windows[i]);
        if (rect && rectContains(rect, pointer))
            return windows[i];
    }
    return null;
}
