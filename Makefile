UUID := $(shell jq -r .uuid metadata.json)
BUILD_DIR = build
DIST_DIR = dist
BUNDLE = $(DIST_DIR)/$(UUID).shell-extension.zip
SOURCES = extension.js prefs.js $(wildcard lib/*.js) stylesheet.css metadata.json $(wildcard schemas/*.gschema.xml)

.PHONY: all pack install uninstall enable disable prefs test-profile test-shell clean

all: pack

$(BUNDLE): $(SOURCES)
	@mkdir -p $(DIST_DIR)
	gnome-extensions pack --force --out-dir=$(DIST_DIR) --extra-source=lib .

pack: $(BUNDLE)

install: $(BUNDLE)
	gnome-extensions install --force $(BUNDLE)

uninstall:
	gnome-extensions uninstall $(UUID)

enable:
	gnome-extensions enable $(UUID)

disable:
	gnome-extensions disable $(UUID)

prefs:
	gnome-extensions prefs $(UUID)

clean:
	rm -rfv $(BUILD_DIR) $(DIST_DIR)

# --- Testing ---

PROFILE_DIR = $(CURDIR)/$(BUILD_DIR)/profile
PROFILE_ENV = HOME="$(PROFILE_DIR)" \
	XDG_CONFIG_HOME="$(PROFILE_DIR)/.config" \
	XDG_DATA_HOME="$(PROFILE_DIR)/.local/share" \
	XDG_CACHE_HOME="$(PROFILE_DIR)/.cache" \
	XDG_STATE_HOME="$(PROFILE_DIR)/.local/state" \
	GIO_USE_VFS=local

test-profile: $(PROFILE_DIR)/.stamp
$(PROFILE_DIR)/.stamp: $(BUNDLE) test-profile.ini Makefile
	mkdir -p $(PROFILE_DIR)
	$(PROFILE_ENV) gnome-extensions install --force $(BUNDLE)
	sed 's/@UUID@/$(UUID)/g' test-profile.ini | $(PROFILE_ENV) dbus-run-session dconf load /
	touch $@

test-shell: test-profile
	@test -x /usr/libexec/mutter-devkit || { echo "mutter-devkit is required" >&2; exit 1; }
	$(PROFILE_ENV) dbus-run-session gnome-shell --devkit --wayland --no-x11
