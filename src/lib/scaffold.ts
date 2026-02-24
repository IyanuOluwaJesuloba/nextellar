import path from "path";
import fs from "fs-extra";
import { runInstall } from "./install.js";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ScaffoldOptions {
  appName: string;
  useTs: boolean;
  template?: string;
  withContracts?: boolean;
  horizonUrl?: string;
  sorobanUrl?: string;
  wallets?: string[];
  defaults?: boolean;
  skipInstall?: boolean;
  packageManager?: "npm" | "yarn" | "pnpm";
  installTimeout?: number;
}

export async function scaffold(options: ScaffoldOptions) {
  const {
    appName,
    useTs,
    template,
    withContracts,
    horizonUrl,
    sorobanUrl,
    wallets,
    skipInstall,
    packageManager,
    installTimeout,
  } = options;

  const templateName = template || "default";
  if (!useTs && templateName !== "default") {
    throw new Error(
      `Template "${templateName}" is not available for JavaScript yet. Please use the default template with --javascript.`
    );
  }
  const resolvedTemplateName = useTs ? templateName : "js-template";

  // Point to source templates
  // Resolve relative to this file's location in either src/lib or dist/src/lib
  const templateDir = path.resolve(
    __dirname,
    fs.existsSync(path.resolve(__dirname, "../../templates"))
      ? `../../templates/${resolvedTemplateName}` // Development (src/lib -> src/templates)
      : `../../../src/templates/${resolvedTemplateName}` // Production (dist/src/lib -> src/templates)
  );
  const targetDir = path.resolve(process.cwd(), appName);

  if (await fs.pathExists(targetDir)) {
    throw new Error(`Directory "${appName}" already exists.`);
  }

  // Copy template
  await fs.copy(templateDir, targetDir, {
    filter: (src) => {
      const basename = path.basename(src);
      return basename !== ".git" && basename !== "node_modules";
    },
    preserveTimestamps: true,
  });

  // Conditionally copy contracts and bindings
  if (withContracts) {
    const contractsTemplateDir = path.resolve(
      __dirname,
      fs.existsSync(path.resolve(__dirname, "../../templates"))
        ? "../../templates/contracts-template"
        : "../../../src/templates/contracts-template"
    );

    if (await fs.pathExists(contractsTemplateDir)) {
      await fs.copy(contractsTemplateDir, targetDir, {
        preserveTimestamps: true,
      });
    }

    // Add scripts to package.json
    const pkgJsonPath = path.join(targetDir, "package.json");
    if (await fs.pathExists(pkgJsonPath)) {
      const pkgJson = await fs.readJson(pkgJsonPath);
      pkgJson.scripts = pkgJson.scripts || {};
      pkgJson.scripts["contracts:build"] = "cd contracts && stellar contract build";
      pkgJson.scripts["contracts:test"] = "cd contracts && cargo test";
      await fs.writeJson(pkgJsonPath, pkgJson, { spaces: 2 });
    }

    // Append env vars to .env.example
    const envExamplePath = path.join(targetDir, ".env.example");
    await fs.appendFile(
      envExamplePath,
      `\n# Soroban Smart Contracts\nNEXT_PUBLIC_HELLO_WORLD_CONTRACT_ID=C_REPLACE_WITH_YOUR_CONTRACT_ID\n`
    );
  }

  // --- TEMPLATE SUBSTITUTION LOGIC ---
  const replaceInFile = async (
    filePath: string,
    replacements: Record<string, string>
  ) => {
    const content = await fs.readFile(filePath, "utf8");
    let newContent = content;
    for (const [key, value] of Object.entries(replacements)) {
      newContent = newContent.replaceAll(key, value);
    }
    await fs.writeFile(filePath, newContent, "utf8");
  };

  const config = {
    "{{APP_NAME}}": appName,
    "{{HORIZON_URL}}": horizonUrl || "https://horizon-testnet.stellar.org",
    "{{SOROBAN_URL}}": sorobanUrl || "https://soroban-testnet.stellar.org",
    "{{NETWORK}}":
      horizonUrl && horizonUrl.includes("public") ? "PUBLIC" : "TESTNET",
    '["freighter", "albedo", "lobstr"]':
      wallets && wallets.length > 0
        ? JSON.stringify(wallets)
        : JSON.stringify(["freighter", "albedo", "lobstr"]),
    "{{NEXTELLAR_VERSION}}": (() => {
      try {
        const pkgPath = fs.existsSync(path.resolve(__dirname, "../../package.json"))
          ? path.resolve(__dirname, "../../package.json")
          : path.resolve(__dirname, "../../../package.json");
        const myPkg = fs.readJsonSync(pkgPath);
        return myPkg.version || "0.0.0";
      } catch {
        return "0.0.0";
      }
    })(),
    "{{TEMPLATE_NAME}}": templateName,
    "{{TIMESTAMP}}": new Date().toISOString(),
  };

  // Files to update
  const filesToProcess = [
    path.join(targetDir, "package.json"),
    path.join(targetDir, "src/contexts/WalletProvider.tsx"),
    path.join(targetDir, "src/contexts/WalletProvider.jsx"),
    path.join(targetDir, "src/lib/stellar-wallet-kit.ts"),
    path.join(targetDir, "src/lib/stellar-wallet-kit.js"),
    path.join(targetDir, "src/hooks/useSorobanContract.ts"),
    path.join(targetDir, "src/hooks/useSorobanContract.js"),
    path.join(targetDir, ".env.example"),
    path.join(targetDir, ".nextellar/config.json"),
  ];

  for (const filePath of filesToProcess) {
    if (await fs.pathExists(filePath)) {
      await replaceInFile(filePath, config);
    }
  }

  console.log(`✔️  Scaffolded "${appName}" from template.`);

  // Run installation
  const result = await runInstall({
    cwd: targetDir,
    skipInstall,
    packageManager,
    timeout: installTimeout,
  });

  if (!result.success && !skipInstall) {
    throw new Error(
      `Dependency installation failed. Please run "${result.packageManager} install" manually in "${appName}".`
    );
  }
}
