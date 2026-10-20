# Accessibility

IGL exists so that people can see, check and trust what an AI system was allowed to do. That promise is hollow if a person who relies on a screen reader, keyboard, magnification or other assistive technology cannot read the receipt, run the demo, or file an issue. We want everyone who uses or contributes to IGL to be able to do so without barriers.

This document describes the accessibility outcomes we aim for, what we ask of contributors, how to report a barrier, and what we know does not yet work well. It covers everything in this repository that a person interacts with directly:

- The **id-me.ai site** and its generated API reference (`platform/site/`)
- **IGL Studio**, the browser interface served by the provisioning service (`npm run provision`)
- The **`igl` command-line tool** (`npx igl demo`, `provision/cli.mjs`)
- The **documentation** in `docs/`, the README and the other Markdown files in this repository

The runtime library, the platform API and the MCP endpoints are consumed by code rather than by people, so this document does not cover them beyond the error messages and output they produce.

## Priorities

Our goal is that every task a person can perform through IGL's interfaces can be completed without a mouse, without sight, and without relying on colour alone. We treat the [Web Content Accessibility Guidelines (WCAG) 2.2 Level AA](https://www.w3.org/TR/WCAG22/) as the target we are working toward for the site and IGL Studio. **This is an aspiration, not a conformance claim.** No formal evaluation has been carried out yet. If and when one is, we will record the evaluated scope, date, method and evaluator here.

The areas we prioritize, in order:

1. **Keyboard access.** Everything on the site and in IGL Studio should be reachable and operable with a keyboard alone, with a visible focus indicator.
2. **Screen reader access.** Pages should have a sensible heading structure, images should have meaningful alternative text, and interactive controls should have accessible names. The README already provides alt text for the logo and we hold other images to the same standard.
3. **Plain-language content.** IGL's documentation deliberately explains concepts for people who are not developers (see "If you are not a developer" in the README). We want error messages, docs and site copy to stay readable without jargon where jargon is avoidable. Where an error code such as `IGL_BOUNDARY_REJECTED` is unavoidable, it should be accompanied by a plain sentence saying what happened.
4. **Terminal output that works without colour or layout.** The CLI demo and the provisioning CLI should convey meaning in words, not only through colour, alignment or symbols, so that screen readers and plain-text logs carry the same information.
5. **Respecting user preferences.** The site should honour the operating system's light and dark colour scheme (the README logo already does) and should not rely on motion to convey information.

## Contributor expectations

The project's bar for changes is high because the governance guarantees only hold if the code is right. Accessibility is part of that bar for anything a person sees or operates.

When a pull request changes the site (`platform/site/`), IGL Studio (`provision/`), CLI output, or documentation, we ask that you:

- **Use native HTML elements first.** Buttons for actions, links for navigation, headings in order, labels attached to form fields. Add ARIA only when a native element cannot do the job.
- **Check it with a keyboard.** Tab through anything you added or changed. Confirm you can reach it, operate it and see where focus is.
- **Give images and icons a text alternative,** or mark them decorative if they carry no information.
- **Do not convey meaning by colour alone.** This applies to the site, to IGL Studio and to terminal output.
- **Keep content readable.** Follow the plain-language style already used in the README and `docs/`.
- **Say what you tested in the PR description.** For user-facing changes, a short note such as "tested with keyboard only in Firefox" or "checked with VoiceOver in Safari" is the evidence we are looking for. We do not require specific tooling, because the project does not yet run automated accessibility checks in CI; `npm run check` covers lint, type checking and the test suite, not accessibility.

Reviewers may ask for changes on accessibility grounds in the same way they would for a failing test. The pull request process in [CONTRIBUTING.md](./CONTRIBUTING.md) applies as usual, including DCO sign-off.

## Reporting accessibility issues

If something in IGL is hard or impossible for you to use, please tell us. You do not need to know whether it is "really" an accessibility issue, and you do not need to disclose a disability to report it.

**Open an issue** using the [bug report form](https://github.com/SMEPro-Technologies-LLC/igl/issues/new?template=bug.yml). Choose the **Area** that matches (for the site or IGL Studio pick "Other" or "Docs" as appropriate) and start the title with `a11y:` so it is easy to find. If GitHub's issue form is itself a barrier for you, email **conduct@id-me.ai** with the same information and we will file the issue on your behalf.

It helps us to know:

- What you were trying to do (for example, "run the demo and read the refusal line", "open the API reference for `/identities`")
- The URL, page, command or file involved
- What happened, and what you expected instead
- Your browser or terminal and operating system
- Any assistive technology you were using (screen reader, magnifier, switch, voice control, and so on), with versions if you know them

Screenshots or recordings are welcome but entirely optional.

For a security vulnerability, do not use the public tracker; see [SECURITY.md](./SECURITY.md).

### Severity

Maintainers assign severity during triage. You are welcome to suggest one, but you do not have to. We use three levels, based on how strongly the barrier affects completing a task:

| Severity | Meaning | Example |
|---|---|---|
| **Blocking** | A task cannot be completed at all with the assistive technology or input method in question, and there is no workaround. | A control in IGL Studio can only be activated with a mouse; the Contact Sales form cannot be submitted from the keyboard. |
| **Major** | The task can be completed, but only with significant difficulty, or through a workaround that most people would not find. | A page has no headings so a screen reader user must read every line to find a section; the demo output reports "verifies" only through colour. |
| **Minor** | The task can be completed with little extra effort, but the experience is worse than it should be. | A decorative image is announced by its file name; a focus ring is faint against the dark theme. |

These labels match the `bug` and `triage` labels already applied by the issue form; maintainers add `a11y` and a severity label during triage.

### How we respond

Issues in this repository are reviewed weekly, as stated in [SUPPORT.md](./SUPPORT.md). For accessibility reports you can expect:

- **Acknowledgement** on the issue within that weekly review, usually within seven days.
- **A severity label and an owner** assigned at triage.
- **A workaround**, if we know one, posted on the issue as soon as we identify it, even before a fix lands.
- **Status updates** on the issue when work starts and when a fix is merged. We do not currently promise fixed resolution dates; blocking issues are prioritized ahead of other work on the affected surface.
- **An invitation to verify.** When a fix is merged we will ask on the issue whether it resolves the barrier for you before closing it. If we do not hear back within four weeks we will close the issue, and you can reopen it at any time.

## Ownership and maintenance

Accessibility is owned by the project steward, **SMEPro Technologies LLC** ([@SMEPro-Technologies-LLC](https://github.com/SMEPro-Technologies-LLC)), as listed in [MAINTAINERS.md](./MAINTAINERS.md). The steward is responsible for triaging `a11y:` issues, reviewing accessibility aspects of pull requests to the site, IGL Studio, CLI and docs, and keeping this document accurate.

This statement is reviewed at least once per minor release of the runtime (see [CHANGELOG.md](./CHANGELOG.md)) and whenever a new user-facing surface is added. If maintainership changes, accessibility ownership transfers with it and this section and `MAINTAINERS.md` are updated in the same pull request, following the process in [GOVERNANCE.md](./GOVERNANCE.md).

## Supported environments

The runtime and CLI require Node.js 20 or newer and are exercised in CI on Node 20 and 22, on Linux. The CLI produces plain text and should work in any terminal, including those driven by a screen reader; this has not been systematically verified.

The id-me.ai site and IGL Studio are plain HTML, CSS and JavaScript. They are developed and informally checked in current releases of Chrome and Firefox on macOS and Linux, with keyboard navigation. We have **not yet** tested with specific screen readers, magnifiers, voice control or on mobile browsers, and we do not claim support for those combinations. If you use one of them and something works, or does not, we would like to hear about it.

## Known limitations

We have not completed an accessibility review of any surface, so the list below reflects what we have noticed rather than a full picture.

- **No automated accessibility checks run in CI.** Regressions in the site or IGL Studio can land without being caught. We rely on reviewer attention and your reports until this is in place.
- **The site has not been checked for reduced-motion preferences.** If you have motion sensitivity and encounter animation you cannot disable, please report it.
- **The CLI demo uses alignment and spacing to lay out results.** In a screen reader or when wrapped in a narrow terminal, the relationship between a label (such as `refused`) and its explanation may be harder to follow. The information is present in words, but the layout has not been checked with a screen reader.
- **The generated API reference is produced by a script** (`platform/site/gen_reference.py`). Its heading structure and link text follow the OpenAPI document and have not been audited for screen reader navigation.
- **Documentation in `docs/` uses tables and code blocks heavily.** These are readable, but long tables may be hard to navigate in some screen readers. There is no alternative presentation at present.

Where a limitation above is tracked as an issue, it will be linked from this list. Workarounds: the same information shown in IGL Studio and the demo is available as plain JSON through the HTTP API, and every page of the site is also described in `platform/site/llms.txt` as plain text.

## Feedback and improvements

Suggestions for this statement or for how the project approaches accessibility are welcome in [GitHub Discussions](https://github.com/SMEPro-Technologies-LLC/igl/discussions) or as a pull request editing this file. If something is actively blocking you, please use the reporting process above instead so it is triaged and tracked.
