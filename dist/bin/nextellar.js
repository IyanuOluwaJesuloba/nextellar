#!/usr/bin/env node
import { Command } from "commander";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs-extra";
import pc from "picocolors";
import gradient from "gradient-string";
import { scaffold } from "../src/lib/scaffold.js";
import { upgrade } from "../src/lib/upgrade.js";
import { runDeploy } from "../src/lib/deploy.js";
import { displaySuccess, NEXTELLAR_LOGO } from "../src/lib/feedback.js";
import { detectPackageManager } from "../src/lib/install.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// (doctor subcommand is registered later after `program` is created)
// Find package.json regardless of whether we are in src/bin or dist/bin
const findPkg = () => {
    const paths = [
        path.join(__dirname, "../package.json"),
        path.join(__dirname, "../../package.json"),
    ];
    for (const p of paths) {
        if (fs.existsSync(p)) {
            return fs.readJsonSync(p);
        }
    }
    return { version: "0.0.0" }; // Fallback
};
const pkg = findPkg();
const program = new Command();
// Register a dedicated `doctor` subcommand so Commander handles `--json`.
program
    .command("doctor")
    .description("Run environment diagnostics")
    .option("--json", "output results as JSON for CI integration")
    .action(async (cmdOpts) => {
    try {
        const { runDoctor } = await import("../src/lib/doctor.js");
        const exitCode = await runDoctor({ json: !!cmdOpts.json });
        process.exit(exitCode);
    }
    catch (err) {
        console.error("Failed to run doctor:", err?.message || err);
        process.exit(1);
    }
});
program
    .command("upgrade")
    .description("Upgrade an existing Nextellar project to the latest template files")
    .option("--dry-run", "Show what would change without applying it", false)
    .option("--yes", "Apply changes without prompting", false)
    .action(async (options) => {
    try {
        await upgrade({ dryRun: options.dryRun, yes: options.yes });
    }
    catch (err) {
        console.error(`\n❌ Error: ${err.message}`);
        process.exit(1);
    }
});
program
    .command("deploy")
    .description("Validate and prepare a deployment bundle for Nextellar Cloud")
    .option("--dry-run", "validate and show what would be deployed without bundling")
    .action(async (cmdOpts) => {
    try {
        await runDeploy({
            cwd: process.cwd(),
            dryRun: !!cmdOpts.dryRun,
        });
    }
    catch (err) {
        console.error(`\n❌ Error: ${err?.message || err}`);
        process.exit(1);
    }
});
program
    .name("nextellar")
    .description("CLI to scaffold a Next.js + Stellar starter")
    .version(pkg.version, "-v, --version", "output the current version")
    .argument("<project-name>", "name of the new Nextellar project")
    .option("-t, --typescript", "generate a TypeScript project (default)", true)
    .option("-j, --javascript", "generate a JavaScript project")
    .option("--template <name>", "project template to use (default, minimal, defi)")
    .option("--horizon-url <url>", "custom Horizon endpoint")
    .option("--soroban-url <url>", "custom Soroban RPC endpoint")
    .option("-w, --wallets <list>", "comma-separated wallet adapters (freighter, xbull)", "")
    .option("-d, --defaults", "skip prompts and use defaults", false)
    .option("--skip-install", "skip dependency installation after scaffolding", false)
    .option("--package-manager <manager>", "choose package manager (npm, yarn, pnpm)")
    .option("-c, --with-contracts", "scaffold Soroban smart contracts alongside the frontend", false)
    .option("--install-timeout <ms>", "installation timeout in milliseconds", "1200000");
program.action(async (projectName, options) => {
    const template = options.template || "default";
    const validTemplates = ["default", "minimal", "defi"];
    const useTs = options.typescript && !options.javascript;
    if (!validTemplates.includes(template)) {
        console.error(`Unknown template "${template}". Available: default, minimal, defi`);
        process.exit(1);
    }
    // Clear console and show welcome banner
    if (process.stdout.isTTY) {
        process.stdout.write("\x1Bc");
        console.log(gradient(["#FFFFFF", "#000000"])(NEXTELLAR_LOGO));
        console.log(`\n  ${pc.bold(pc.white("Nextellar CLI"))} ${pc.dim(`v${pkg.version}`)}`);
        console.log(`  ${pc.dim("Modern Next.js + Stellar toolkit")}\n`);
        console.log(`  ${pc.magenta("◆")} Project: ${pc.cyan(projectName)}`);
        console.log(`  ${pc.magenta("◆")} Type:    ${pc.cyan(useTs ? "TypeScript" : "JavaScript")}`);
        console.log(`  ${pc.magenta("◆")} Template: ${pc.cyan(template)}`);
        console.log(`  ${pc.magenta("◆")} Contracts: ${pc.cyan(options.withContracts ? "Yes" : "No")}\n`);
    }
    const wallets = options.wallets ? options.wallets.split(",") : [];
    try {
        await scaffold({
            appName: projectName,
            useTs,
            template,
            withContracts: options.withContracts,
            horizonUrl: options.horizonUrl,
            sorobanUrl: options.sorobanUrl,
            wallets,
            defaults: options.defaults,
            skipInstall: options.skipInstall,
            packageManager: options.packageManager,
            installTimeout: parseInt(options.installTimeout),
        });
        const pkgManager = detectPackageManager(path.join(process.cwd(), projectName), options.packageManager);
        await displaySuccess(projectName, pkgManager, options.skipInstall);
    }
    catch (err) {
        console.error(`\n❌ Error: ${err.message}`);
        process.exit(1);
    }
});
program.parse(process.argv);
