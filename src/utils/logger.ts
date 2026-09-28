import chalk from 'chalk';
import ora, { type Ora } from 'ora';
import type { Logger, Spinner } from '../types.js';

const green = (text: string) => chalk.green(text);
const red = (text: string) => chalk.red(text);

export function createLogger(stream: NodeJS.WriteStream = process.stdout): Logger {
  const interactive = Boolean(stream.isTTY) && process.env.NO_COLOR === undefined;

  /**
   * Without a TTY (CI, piped output) there is nothing to animate, so the step is
   * silent while it runs and reported as a plain line when it finishes. Progress
   * stays visible instead of disappearing entirely.
   */
  const start = (text: string): Spinner => {
    if (!interactive) {
      return {
        update() {},
        succeed: (message) => stream.write(`${green('✔')} ${message ?? text}\n`),
        fail: (message) => process.stderr.write(`${red('✖')} ${message ?? text}\n`),
        stop() {},
      };
    }

    const spinner: Ora = ora({ text, stream }).start();
    return {
      update: (next) => {
        spinner.text = next;
      },
      succeed: (message) => {
        spinner.succeed(message ?? text);
      },
      fail: (message) => {
        spinner.fail(message ?? text);
      },
      stop: () => {
        spinner.stop();
      },
    };
  };

  return {
    interactive,
    banner(version) {
      stream.write(chalk.bold.cyan(`\n🚀 Create Rohit App v${version}\n`));
    },
    info(message) {
      stream.write(`${chalk.cyan('•')} ${message}\n`);
    },
    success(message) {
      stream.write(`${chalk.green('✔')} ${message}\n`);
    },
    warn(message) {
      stream.write(`${chalk.yellow('⚠')} ${message}\n`);
    },
    error(message) {
      // Errors belong on stderr so `> file` still captures them separately.
      process.stderr.write(`${chalk.red('✖')} ${message}\n`);
    },
    hint(lines) {
      for (const line of lines) {
        process.stderr.write(`${chalk.dim('•')} ${line}\n`);
      }
    },
    blank() {
      stream.write('\n');
    },
    celebrate(message) {
      stream.write(chalk.bold.green(`\n🎉 ${message}\n`));
    },
    nextSteps(lines) {
      stream.write(chalk.bold('\nNext steps:') + '\n');
      for (const line of lines) stream.write(`  ${line}\n`);
    },
    start,
  };
}
