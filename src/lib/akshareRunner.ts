import { spawn } from "node:child_process";
import path from "node:path";

export type AkshareSuccess<T> = {
  ok: true;
  data: T;
};

export type AkshareFailure = {
  ok: false;
  error: string;
  details?: string;
};

export type AkshareResponse<T> = AkshareSuccess<T> | AkshareFailure;

export type AkshareCommand = "history" | "overview" | "stock_info_global_em";

const MAX_RETRIES_PER_EXECUTABLE = 3;
const RETRY_BASE_DELAY_MS = 350;

const TRANSIENT_ERROR_PATTERNS = [
  "connection aborted",
  "remote end closed connection",
  "timed out",
  "timeout",
  "temporarily unavailable",
  "connection reset",
  "max retries exceeded",
  "failed to establish a new connection",
  "proxyerror",
  "ssl",
];

const inflightRequests = new Map<string, Promise<AkshareResponse<unknown>>>();

function uniqueExecutables(list: Array<string | undefined>) {
  const values = list.filter(Boolean) as string[];
  return Array.from(new Set(values));
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isTransientMessage(message: string | undefined) {
  if (!message) {
    return false;
  }

  const normalized = message.toLowerCase();
  return TRANSIENT_ERROR_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function isMissingExecutableError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes("enoent") || message.includes("spawn");
}

function isTransientAkshareFailure(result: AkshareFailure) {
  return isTransientMessage(`${result.error} ${result.details ?? ""}`);
}

function buildRequestKey(
  command: AkshareCommand,
  options: Record<string, string | number | undefined>,
) {
  const normalizedEntries = Object.entries(options)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .sort(([left], [right]) => left.localeCompare(right));

  return JSON.stringify([command, normalizedEntries]);
}

async function runWithPythonExecutable<T>(
  pythonExecutable: string,
  scriptPath: string,
  command: AkshareCommand,
  options: Record<string, string | number | undefined>,
): Promise<AkshareResponse<T>> {
  const cliArgs = [scriptPath, command];
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined || value === null || value === "") continue;
    cliArgs.push(`--${key}`, String(value));
  }

  return new Promise((resolve, reject) => {
    const child = spawn(pythonExecutable, cliArgs, {
      cwd: process.cwd(),
      env: process.env,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      const rawOutput = stdout.trim();

      if (!rawOutput) {
        const message = stderr.trim() || `AkShare process exited with code ${code}`;
        reject(new Error(`[${pythonExecutable}] ${message}`));
        return;
      }

      try {
        const parsed = JSON.parse(rawOutput) as AkshareResponse<T>;
        resolve(parsed);
      } catch (error) {
        const parseMessage =
          error instanceof Error ? error.message : "Unknown JSON parse error";
        reject(
          new Error(
            `[${pythonExecutable}] Failed to parse AkShare response: ${parseMessage}. stdout=${rawOutput}. stderr=${stderr.trim()}`,
          ),
        );
      }
    });
  });
}

async function runWithRetryForExecutable<T>(
  pythonExecutable: string,
  scriptPath: string,
  command: AkshareCommand,
  options: Record<string, string | number | undefined>,
) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES_PER_EXECUTABLE; attempt += 1) {
    try {
      const result = await runWithPythonExecutable<T>(
        pythonExecutable,
        scriptPath,
        command,
        options,
      );

      if (result.ok) {
        return result;
      }

      if (!isTransientAkshareFailure(result)) {
        return result;
      }

      lastError = new Error(
        `[${pythonExecutable}] ${result.error}${
          result.details ? `: ${result.details}` : ""
        }`,
      );
    } catch (error) {
      lastError = error;

      if (isMissingExecutableError(error)) {
        break;
      }

      const message = error instanceof Error ? error.message : String(error);
      if (!isTransientMessage(message)) {
        break;
      }
    }

    if (attempt < MAX_RETRIES_PER_EXECUTABLE) {
      await delay(RETRY_BASE_DELAY_MS * attempt);
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error(`[${pythonExecutable}] AkShare execution failed without details.`);
}

async function runAkshareCommandUncached<T>(
  command: AkshareCommand,
  options: Record<string, string | number | undefined>,
): Promise<AkshareResponse<T>> {
  const scriptPath = path.join(process.cwd(), "Akshare", "stock_data_service.py");
  const candidates = uniqueExecutables([
    process.env.AKSHARE_PYTHON_EXECUTABLE,
    process.env.PYTHON_EXECUTABLE,
    "/opt/anaconda3/envs/langchain_env/bin/python",
    "python3",
    "python",
  ]);

  let lastError: unknown;

  for (const executable of candidates) {
    try {
      const result = await runWithRetryForExecutable<T>(
        executable,
        scriptPath,
        command,
        options,
      );
      return result;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error("No usable Python executable found for AkShare command.");
}

export async function runAkshareCommand<T>(
  command: AkshareCommand,
  options: Record<string, string | number | undefined>,
): Promise<AkshareResponse<T>> {
  const requestKey = buildRequestKey(command, options);
  const existingRequest = inflightRequests.get(requestKey);

  if (existingRequest) {
    return (await existingRequest) as AkshareResponse<T>;
  }

  const task = runAkshareCommandUncached<T>(command, options);
  inflightRequests.set(requestKey, task as Promise<AkshareResponse<unknown>>);

  try {
    return await task;
  } finally {
    inflightRequests.delete(requestKey);
  }
}
