import fs from "fs";
import path from "path";
import childProcess from "child_process";
import pkg from "../package.json";

/**
 * Script to automatically reformat commit/PR release notes
 * and append/update them directly in CHANGELOG.md
 */

const changelogPath = path.resolve("./CHANGELOG.md");
const currentVersion = process.env.VERSION || pkg.version || "2.0.0";
const today = new Date().toISOString().split("T")[0];

// Input can be passed via command line argument, stdin, or git log
let rawInput = process.argv.slice(2).join(" ").trim();

if (!rawInput) {
    // Try to get git commits since last tag
    try {
        const lastTag = childProcess.execSync("git describe --tags --abbrev=0 2>/dev/null || true").toString().trim();
        const gitLogCmd = lastTag ? `git log ${lastTag}..HEAD --oneline` : "git log -n 20 --oneline";
        rawInput = childProcess.execSync(gitLogCmd).toString().trim();
    } catch (e) {
        rawInput = "";
    }
}

function parseAndFormat(input: string, version: string, date: string): string {
    const lines = input.split("\n").filter((line) => line.trim() !== "");
    const features: string[] = [];
    const fixes: string[] = [];
    const improvements: string[] = [];
    const i18n: string[] = [];
    const others: string[] = [];

    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("* ") || trimmed.startsWith("- ") || /^[0-9a-f]{7,}/i.test(trimmed)) {
            let msg = trimmed.replace(/^[*-\s]+/, "").replace(/^[0-9a-f]{7,}\s+/, "");

            // Categorize based on conventional commit prefixes or keywords
            if (msg.startsWith("feat") || msg.includes("feature")) {
                features.push(`- ${msg}`);
            } else if (msg.startsWith("fix") || msg.includes("bug")) {
                fixes.push(`- ${msg}`);
            } else if (msg.startsWith("i18n") || msg.startsWith("lang") || msg.includes("translation")) {
                i18n.push(`- ${msg}`);
            } else if (msg.startsWith("refactor") || msg.startsWith("perf") || msg.startsWith("docs")) {
                improvements.push(`- ${msg}`);
            } else {
                others.push(`- ${msg}`);
            }
        }
    }

    let result = `\n## [${version}] - ${date}\n\n`;

    if (features.length > 0) {
        result += `### 🚀 New Features\n${features.join("\n")}\n\n`;
    }
    if (improvements.length > 0) {
        result += `### ⬆️ Improvements & Refactoring\n${improvements.join("\n")}\n\n`;
    }
    if (fixes.length > 0) {
        result += `### 🐛 Bug Fixes\n${fixes.join("\n")}\n\n`;
    }
    if (i18n.length > 0) {
        result += `### 🦎 Translations & i18n\n${i18n.join("\n")}\n\n`;
    }
    if (others.length > 0) {
        result += `### 📝 Other Changes\n${others.join("\n")}\n\n`;
    }

    return result;
}

// Generate new release markdown snippet
const formattedSection = parseAndFormat(rawInput, currentVersion, today);

console.log("Formatted Changelog Output:\n");
console.log(formattedSection);

// Update CHANGELOG.md directly if it exists
if (fs.existsSync(changelogPath)) {
    let changelogContent = fs.readFileSync(changelogPath, "utf-8");

    // Check if this version header already exists to prevent duplicate entries
    if (!changelogContent.includes(`## [${currentVersion}]`)) {
        const headerEndIndex = changelogContent.indexOf("---\n");
        if (headerEndIndex !== -1) {
            const insertPosition = headerEndIndex + 4;
            changelogContent = changelogContent.slice(0, insertPosition) + formattedSection + changelogContent.slice(insertPosition);
        } else {
            changelogContent += formattedSection;
        }

        fs.writeFileSync(changelogPath, changelogContent, "utf-8");
        console.log(`✅ Successfully updated ${changelogPath} with version ${currentVersion}`);
    } else {
        console.log(`ℹ️ Version ${currentVersion} already present in CHANGELOG.md`);
    }
} else {
    // Create new CHANGELOG.md
    const newFileContent = `# Changelog - Dockge-plus\n\nAll notable changes to **Dockge-plus** will be documented in this file.\n\n---\n${formattedSection}`;
    fs.writeFileSync(changelogPath, newFileContent, "utf-8");
    console.log(`✅ Created ${changelogPath} with version ${currentVersion}`);
}
