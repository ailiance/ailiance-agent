# Contributing to ailiance-agent

ailiance-agent is a fork of [Dirac](https://github.com/dirac-run/dirac) (itself based on Cline) re-focused on EU sovereignty and routed to the [ailiance](https://github.com/ailiance/ailiance) gateway by default. We're thrilled you're interested in contributing. Whether you're fixing a bug, adding a feature, or improving our docs, every contribution makes ailiance-agent smarter! To keep our community vibrant and welcoming, all members must adhere to our [Code of Conduct](CODE_OF_CONDUCT.md).

## Reporting Bugs or Issues

Bug reports help make ailiance-agent better for everyone! Before creating a new issue, please [search existing ones](https://github.com/ailiance/ailiance-agent/issues) to avoid duplicates. When you're ready to report a bug, head over to our [issues page](https://github.com/ailiance/ailiance-agent/issues/new/choose) where you'll find a template to help you with filling out the relevant information.

<blockquote class='warning-note'>
     🔐 <b>Important:</b> If you discover a security vulnerability, please use the <a href="https://github.com/ailiance/ailiance-agent/security/advisories/new">Github security tool to report it privately</a>.
</blockquote>

## Deciding What to Work On

Looking for a good first contribution? Check out issues labeled ["good first issue"](https://github.com/ailiance/ailiance-agent/labels/good%20first%20issue) or ["help wanted"](https://github.com/ailiance/ailiance-agent/labels/help%20wanted). These are specifically curated for new contributors and areas where we'd love some help!

We also welcome contributions to our [documentation](https://github.com/ailiance/ailiance-agent/tree/main/docs)! Whether it's fixing typos, improving existing guides, or creating new educational content - we'd love to build a community-driven repository of resources that helps everyone get the most out of ailiance-agent. You can start by diving into `/docs` and looking for areas that need improvement.

If you plan to work on a larger feature, please first create a [feature request](https://github.com/ailiance/ailiance-agent/discussions/categories/feature-requests) so we can discuss if it aligns with ailiance-agent's vision.

## Development Setup

### 1. VS Code Extensions
- When opening the project, VS Code will prompt you to install recommended extensions.
- These extensions are required for development - please accept all installation prompts.
- If you dismissed the prompts, you can install them manually from the Extensions panel.

### 2. Local Development
1. Clone the repository:
   ```bash
   git clone https://github.com/ailiance/ailiance-agent.git
   ```
2. Install dependencies for the extension and webview:
   ```bash
   npm run install:all
   ```
3. Generate Protocol Buffer files (required before first build):
   ```bash
   npm run protos
   ```
4. Launch by pressing `F5` (or `Run` -> `Start Debugging`) to open a new VS Code window with the extension loaded.

## Writing and Submitting Code

Anyone can contribute code to ailiance-agent, but we ask that you follow these guidelines to ensure your contributions can be smoothly integrated:

### 1. Keep Pull Requests Focused
- Limit PRs to a single feature or bug fix.
- Split larger changes into smaller, related PRs.
- Break changes into logical commits that can be reviewed independently.

### 2. Code Quality
- Run `npm run lint` to check code style.
- Run `npm run format` to automatically format code.
- All PRs must pass CI checks which include both linting and formatting.
- Follow TypeScript best practices and maintain type safety.

### 3. Testing
- Add tests for new features.
- Run `npm test` to ensure all tests pass.
- Update existing tests if your changes affect them.

### 4. Commit Guidelines
- Write clear, descriptive commit messages.
- Use conventional commit format (e.g., "feat:", "fix:", "docs:").
- Reference relevant issues in commits using #issue-number.

### 5. Before Submitting
- Rebase your branch on the latest main.
- Ensure your branch builds successfully.
- Double-check all tests are passing.
- Review your changes for any debugging code or console logs.

### 6. Pull Request Description
- Clearly describe what your changes do.
- Include steps to test the changes.
- List any breaking changes.
- Add screenshots for UI changes.

## Contribution Agreement

By submitting a pull request, you agree that your contributions will be licensed under the same license as the project ([Apache 2.0](LICENSE)).

Let's build something amazing together! 🚀
