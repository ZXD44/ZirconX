import { world } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { unicodeSymbols as emoji } from "../board/unicode.js";

// Cache for banned players data
let bannedPlayersCache = null;
let lastCacheUpdate = 0;
const CACHE_DURATION = 5000; // 5 seconds

function getBannedPlayers() {
    const currentTime = Date.now();
    if (bannedPlayersCache && currentTime - lastCacheUpdate < CACHE_DURATION) {
        return bannedPlayersCache;
    }

    try {
        const bannedData = world.getDynamicProperty('bannedPlayers');
        bannedPlayersCache = bannedData ? JSON.parse(bannedData) : {};
        lastCacheUpdate = currentTime;
        return bannedPlayersCache;
    } catch (error) {
        console.warn("Error getting banned players:", error);
        return {};
    }
}

function saveBannedPlayers(bannedPlayers) {
    try {
        world.setDynamicProperty('bannedPlayers', JSON.stringify(bannedPlayers));
        bannedPlayersCache = bannedPlayers;
        lastCacheUpdate = Date.now();
        return true;
    } catch (error) {
        console.warn("Error saving banned players:", error);
        return false;
    }
}

function handleBannedPlayers() {
    const bannedPlayers = getBannedPlayers();
    const currentTime = Date.now();

    for (const player of world.getAllPlayers()) {
        const banInfo = bannedPlayers[player.name];

        if (banInfo && !banInfo.isPermanent && banInfo.bannedUntil <= currentTime) {
            const unbanSuccess = unbanPlayer(player);
            if (unbanSuccess) {
                delete bannedPlayers[player.name];
                saveBannedPlayers(bannedPlayers);

                world.sendMessage(
                    `${emoji.PEACE} [BAN SYSTEM]\n` +
                    `${emoji.CHECK} ${player.name}'s ban has expired and they have been unbanned.`
                );
            }
        }
        else if (banInfo && (banInfo.isPermanent || banInfo.bannedUntil > currentTime)) {
            applyBanEffects(player, banInfo);
        }
        else if (!banInfo && player.hasTag("permanent_ban")) {
            unbanPlayer(player);
        }
    }
}

async function applyBanEffects(player) {
    try {
        player.nameTag = `[Banned] ${player.name}`;
        await player.runCommandAsync('gamemode survival @s');
        await player.runCommandAsync('camera @s fade time 0.3 13 0.5 color 0 0 0');
        player.setDynamicProperty("isMuted", true);
        return true;
    } catch (error) {
        console.warn("Error applying ban effects:", error);
        return false;
    }
}

function unbanPlayer(player) {
    try {
        player.removeTag("permanent_ban");
        player.getTags()
            .filter(tag => tag.startsWith("banned:") || tag.startsWith("reason:"))
            .forEach(tag => player.removeTag(tag));

        player.runCommandAsync('gamemode survival @s');
        player.runCommandAsync('tag @s add member');

        player.nameTag = player.name;
        player.setDynamicProperty("isMuted", false);
        player.setDynamicProperty("mutedUntil", 0);

        player.runCommandAsync("playsound random.levelup @s ~~~ 1 1");
        player.runCommandAsync("particle minecraft:villager_happy ~~~ 0 0 0 1 20");

        player.sendMessage(`${emoji.CHECK} Your ban has been lifted! Welcome back!`);

        return true;
    } catch (error) {
        console.warn("Error during unban process:", error);
        return false;
    }
}

async function showBannedPlayersList(source) {
    const bannedPlayers = getBannedPlayers();
    const currentTime = Date.now();

    const activeBans = Object.entries(bannedPlayers)
        .filter(([_, banInfo]) => banInfo.isPermanent || banInfo.bannedUntil > currentTime)
        .map(([playerName, banInfo]) => ({
            name: playerName,
            timeLeft: banInfo.isPermanent ? "PERMANENT" : formatDuration(banInfo.bannedUntil - currentTime),
            reason: banInfo.reason,
            bannedBy: banInfo.bannedBy,
            bannedAt: new Date(banInfo.bannedAt).toLocaleString()
        }));

    if (activeBans.length === 0) {
        const form = new ActionFormData();
        form.title(`${emoji.BOOK} Banned Players List`);
        form.body(`${emoji.CHECK} No players are currently banned.`);
        form.button(`${emoji.ARROW_LEFT} Back to Menu`);

        form.show(source).then(() => {
            showBanManagementMenu(source);
        });
        return;
    }

    const form = new ActionFormData();
    form.title(`${emoji.BOOK} Banned Players List`);
    form.body(activeBans.map(ban =>
        `${emoji.SKULL} Player: ${ban.name}\n` +
        `${emoji.CLOCK} Time Left: ${ban.timeLeft}\n` +
        `${emoji.WARNING} Reason: ${ban.reason}\n` +
        `${emoji.CROWN} Banned By: ${ban.bannedBy}\n` +
        `${emoji.STAR} Banned At: ${ban.bannedAt}`
    ).join("\n\n"));
    form.button(`${emoji.ARROW_LEFT} Back to Menu`);

    form.show(source).then(() => {
        showBanManagementMenu(source);
    });
}

async function showUnbanPlayerMenu(source) {
    const bannedPlayers = getBannedPlayers();
    const currentTime = Date.now();

    const activeBans = Object.entries(bannedPlayers)
        .filter(([_, banInfo]) => banInfo.isPermanent || banInfo.bannedUntil > currentTime)
        .map(([playerName, banInfo]) => ({
            name: playerName,
            banInfo
        }));

    if (activeBans.length === 0) {
        await showErrorMessage(source, `${emoji.CROSS} No banned players found.`);
        return showBanManagementMenu(source);
    }

    const unbanForm = new ModalFormData()
        .title(`${emoji.PEACE} Unban Player`)
        .dropdown(
            "Select player to unban",
            activeBans.map(ban =>
                `${ban.name} (${ban.banInfo.isPermanent ? "PERMANENT" : formatDuration(ban.banInfo.bannedUntil - currentTime)})`
            )
        );

    const response = await unbanForm.show(source);
    if (response.canceled) return showBanManagementMenu(source);

    const selectedBan = activeBans[response.formValues[0]];
    const playerName = selectedBan.name;

    const allBannedPlayers = getBannedPlayers();
    delete allBannedPlayers[playerName];
    saveBannedPlayers(allBannedPlayers);

    const onlinePlayer = [...world.getAllPlayers()].find(p => p.name === playerName);
    if (onlinePlayer) {
        const unbanSuccess = unbanPlayer(onlinePlayer);
        if (!unbanSuccess) {
            await showErrorMessage(source, `${emoji.CROSS} Failed to remove ban effects from ${playerName}`);
            return showBanManagementMenu(source);
        }
    }

    world.sendMessage(
        `${emoji.PEACE} [UNBAN SYSTEM]\n` +
        `${emoji.CHECK} ${playerName} has been unbanned by ${source.name}`
    );

    await showSuccessMessage(source, `${emoji.CHECK} Successfully unbanned ${playerName}`);
    source.runCommandAsync("playsound random.levelup @s ~~~ 1 1");
}

async function showBanManagementMenu(source) {
    const form = new ActionFormData();
    form.title(`${emoji.WARNING} Ban Management System`);
    form.body("Choose an action to manage player bans:");
    form.button(`${emoji.SKULL} Ban Player\nClick to ban a player`, "textures/ui/ban.png");
    form.button(`${emoji.PEACE} Unban Player\nClick to unban a player`, "textures/ui/permissions_member_star.png");
    form.button(`${emoji.LIST} Banned List\nView all banned players`, "textures/ui/copy.png");
    form.button(`${emoji.ARROW_LEFT} Back\nReturn to main menu`, "textures/ui/arrow_dark_left_stretch.png");

    form.show(source).then((response) => {
        if (response.canceled) return;

        switch (response.selection) {
            case 0: showBanPlayerMenu(source); break;
            case 1: showUnbanPlayerMenu(source); break;
            case 2: showBannedPlayersList(source); break;
            case 3: return;
        }
    });
}

async function showBanPlayerMenu(source) {
    try {
        const players = [...world.getAllPlayers()]
            .filter(player => player.name !== source.name)
            .map(player => player.name);

        if (players.length === 0) {
            await showErrorMessage(source, `${emoji.CROSS} No other players online to ban.`);
            return showBanManagementMenu(source);
        }

        const UI = new ModalFormData()
            .title(`${emoji.WARNING} Ban Player`)
            .dropdown(`${emoji.SKULL} Select Player to Ban`, players)
            .toggle(`${emoji.WARNING} Permanent Ban`, false)
            .slider(`${emoji.CLOCK} Days (0-30)`, 0, 30, 1, 0)
            .slider(`${emoji.CLOCK} Hours (0-23)`, 0, 23, 1, 0)
            .slider(`${emoji.CLOCK} Minutes (0-59)`, 0, 59, 1, 0)
            .textField(`${emoji.WARNING} Ban Reason`, "Enter the reason for ban")
            .textField(`${emoji.TREASURE} Custom Ban Title`, "Enter custom ban title (optional)")
            .textField(`${emoji.TREASURE} Custom Ban Message`, "Enter custom ban message (optional)")
            .textField(`${emoji.SHIELD_EFFECT} Appeal Information`, "Enter appeal information (optional)")
            .toggle(`${emoji.PEACE} Announce Ban`, true);

        const response = await UI.show(source);
        if (!response || response.canceled) return showBanManagementMenu(source);

        const [
            selectedPlayerIndex,
            isPermanent,
            days,
            hours,
            minutes,
            reason,
            customTitle,
            customMessage,
            appealInfo,
            shouldAnnounce
        ] = response.formValues;

        if (!reason || reason.trim() === "") {
            await showErrorMessage(source, `${emoji.CROSS} Please provide a ban reason!`);
            return showBanPlayerMenu(source);
        }

        const selectedPlayerName = players[selectedPlayerIndex];
        const selectedPlayer = [...world.getAllPlayers()].find(p => p.name === selectedPlayerName);

        if (!selectedPlayer) {
            await showErrorMessage(source, `${emoji.CROSS} Selected player is no longer online!`);
            return showBanPlayerMenu(source);
        }

        const currentTime = Date.now();
        const banDuration = isPermanent ? Number.MAX_SAFE_INTEGER :
            currentTime + (days * 86400000) + (hours * 3600000) + (minutes * 60000);

        const banInfo = {
            bannedUntil: banDuration,
            reason: reason.trim(),
            bannedBy: source.name,
            isPermanent,
            bannedAt: currentTime,
            customTitle: customTitle?.trim() || null,
            customMessage: customMessage?.trim() || null,
            appealInfo: appealInfo?.trim() || null
        };

        const bannedPlayers = getBannedPlayers();
        bannedPlayers[selectedPlayer.name] = banInfo;

        if (!saveBannedPlayers(bannedPlayers)) {
            await showErrorMessage(source, `${emoji.CROSS} Failed to save ban information`);
            return showBanManagementMenu(source);
        }

        const effectsApplied = await applyBanEffects(selectedPlayer, banInfo);
        if (!effectsApplied) {
            await showErrorMessage(source, `${emoji.CROSS} Failed to apply ban effects`);
            return showBanManagementMenu(source);
        }

        try {
            selectedPlayer.addTag(`banned:${banDuration}`);
            selectedPlayer.addTag(`reason:${reason}`);
            if (isPermanent) selectedPlayer.addTag("permanent_ban");
        } catch (error) {
            console.warn("Error adding ban tags:", error);
        }

        selectedPlayer.setDynamicProperty("isMuted", true);
        selectedPlayer.setDynamicProperty("mutedUntil", banDuration);

        try {
            await selectedPlayer.runCommandAsync("playsound mob.enderdragon.growl @s ~~~ 1 1");
            await selectedPlayer.runCommandAsync("particle minecraft:huge_explosion_emitter ~~~ 0 0 0 0 1");
            await selectedPlayer.runCommandAsync('tag @s remove member');
            await selectedPlayer.runCommandAsync('gamemode survival @s');
            selectedPlayer.nameTag = `[Banned] ${selectedPlayer.name}`;
        } catch (error) {
            console.warn("Error executing ban commands:", error);
        }

        if (shouldAnnounce) {
            const announcement =
                `${emoji.WARNING} [BAN SYSTEM]\n` +
                `${emoji.SKULL} Player: ${selectedPlayer.name}\n` +
                `${emoji.CROWN} Banned By: ${source.name}\n` +
                `${emoji.WARNING} Reason: ${reason}\n` +
                `${emoji.CLOCK} Duration: ${isPermanent ? "PERMANENT" : formatDuration(banDuration - currentTime)}`;
            world.sendMessage(announcement);
        }

        const kickMessage =
            `${banInfo.customTitle || `${emoji.WARNING} YOU ARE BANNED!`}\n\n` +
            `${emoji.SKULL} Player: ${selectedPlayer.name}\n` +
            `${emoji.WARNING} Reason: ${reason}\n` +
            `${emoji.CLOCK} Duration: ${isPermanent ? "PERMANENT" : formatDuration(banDuration - currentTime)}\n` +
            (banInfo.customMessage ? `\n${banInfo.customMessage}\n` : '') +
            (banInfo.appealInfo ? `\n${emoji.PEACE} ${banInfo.appealInfo}` : `\n${emoji.PEACE} Contact admin in game for appeal`);

        try {
            const banForm = new ActionFormData();
            banForm.title(banInfo.customTitle || `${emoji.WARNING} YOU ARE BANNED!`);
            banForm.body(kickMessage);
            banForm.button(`${emoji.CHECK} Accept`);

            banForm.show(selectedPlayer).then(() => {
                selectedPlayer.runCommandAsync(`kick "${selectedPlayer.name}" ${kickMessage}`);
            });
        } catch (error) {
            console.warn("Error showing ban message or kicking player:", error);
        }

        await showSuccessMessage(source, `${emoji.CHECK} Successfully banned ${selectedPlayer.name}`);
        return showBanManagementMenu(source);
    } catch (error) {
        console.warn("Error in showBanPlayerMenu:", error);
        await showErrorMessage(source, `${emoji.CROSS} An error occurred while processing the ban`);
        return showBanManagementMenu(source);
    }
}

function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    const remainingHours = hours % 24;
    const remainingMinutes = minutes % 60;

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (remainingHours > 0) parts.push(`${remainingHours}h`);
    if (remainingMinutes > 0) parts.push(`${remainingMinutes}m`);

    return parts.length > 0 ? parts.join(' ') : 'less than 1m';
}

async function showErrorMessage(source, message) {
    const form = new ActionFormData();
    form.title(`${emoji.CROSS} Error`);
    form.body(message);
    form.button(`${emoji.CHECK} OK`);

    return form.show(source).then(() => { });
}

async function showSuccessMessage(source, message) {
    const form = new ActionFormData();
    form.title(`${emoji.CHECK} Success`);
    form.body(message);
    form.button(`${emoji.CHECK} OK`);

    return form.show(source).then(() => { });
}

world.afterEvents.playerSpawn.subscribe(async (event) => {
    const player = event.player;
    const bannedPlayers = getBannedPlayers();
    const banInfo = bannedPlayers[player.name];
    const currentTime = Date.now();

    if (banInfo) {
        if (!banInfo.isPermanent && banInfo.bannedUntil <= currentTime) {
            const unbanSuccess = unbanPlayer(player);
            if (unbanSuccess) {
                delete bannedPlayers[player.name];
                saveBannedPlayers(bannedPlayers);
                world.sendMessage(
                    `${emoji.PEACE} [BAN SYSTEM]\n` +
                    `${emoji.CHECK} ${player.name}'s ban has expired and they have been unbanned.`
                );
            }
        }
        else if (banInfo.isPermanent || banInfo.bannedUntil > currentTime) {
            applyBanEffects(player, banInfo);

            const kickMessage =
                `${banInfo.customTitle || `${emoji.WARNING} YOU ARE BANNED!`}\n\n` +
                `${emoji.SKULL} Player: ${player.name}\n` +
                `${emoji.WARNING} Reason: ${banInfo.reason}\n` +
                `${emoji.CLOCK} Duration: ${banInfo.isPermanent ? "PERMANENT" : formatDuration(banInfo.bannedUntil - currentTime)}\n` +
                (banInfo.customMessage ? `\n${banInfo.customMessage}\n` : '') +
                (banInfo.appealInfo ? `\n${emoji.PEACE} ${banInfo.appealInfo}` : `\n${emoji.PEACE} Contact admin in game for appeal`);

            try {
                const banForm = new ActionFormData();
                banForm.title(banInfo.customTitle || `${emoji.WARNING} YOU ARE BANNED!`);
                banForm.body(kickMessage);
                banForm.button(`${emoji.CHECK} Accept`);

                banForm.show(player).then(() => {
                    player.runCommandAsync(`kick "${player.name}" ${kickMessage}`);
                });
            } catch (error) {
                console.warn("Error showing ban message:", error);
            }
        }
    }
});

export {
    handleBannedPlayers, showBanManagementMenu, showBannedPlayersList, showBanPlayerMenu,
    showUnbanPlayerMenu
};
