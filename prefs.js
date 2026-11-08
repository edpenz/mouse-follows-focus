// SPDX-License-Identifier: GPL-2.0-or-later

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const SNAP_LOCATIONS = [
    ['relative', 'Relative'],
    ['center', 'Center'],
];

const SNAP_TIMINGS = [
    ['smooth', 'Smooth'],
    ['before', 'Before'],
    ['after', 'After'],
];

// Adw.ComboRow kept in sync with an enum settings key
function enumComboRow(settings, key, options, props) {
    const row = new Adw.ComboRow({
        ...props,
        model: Gtk.StringList.new(options.map(([, label]) => label)),
    });
    const sync = () => {
        const index = options.findIndex(([nick]) => nick === settings.get_string(key));
        row.selected = Math.max(index, 0);
    };
    sync();
    settings.connect(`changed::${key}`, sync);
    row.connect('notify::selected', () => {
        const [nick] = options[row.selected];
        if (settings.get_string(key) !== nick)
            settings.set_string(key, nick);
    });
    return row;
}

export default class MouseFollowsFocusPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({
            title: 'Behaviour',
        });
        page.add(group);

        const snapRow = enumComboRow(settings, 'snap-location', SNAP_LOCATIONS, {
            title: 'Pointer snap location',
            subtitle: 'Where the pointer is placed in the focused window',
        });
        group.add(snapRow);

        group.add(enumComboRow(settings, 'snap-timing', SNAP_TIMINGS, {
            title: 'Pointer snap timing',
            subtitle: 'When the pointer moves relative to window animations',
        }));

        const resizeRow = new Adw.SwitchRow({
            title: 'Move pointer on resize',
            subtitle: 'Also snap when the focused window changes size',
        });
        settings.bind('move-on-resize', resizeRow, 'active',
            Gio.SettingsBindFlags.DEFAULT);
        group.add(resizeRow);

        window.add(page);
    }
}
