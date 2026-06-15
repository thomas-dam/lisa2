VISION_AND_PRINCIPLES.md

Lisa

Lisa is not intended to become another chatbot.

The goal is a local-first companion that accumulates capability over time while remaining useful, curious, and adaptable.

The long-term objective is not conversation for its own sake. The objective is a practical partner that can learn workflows, operate tools, generate content, and eventually build parts of its own supporting ecosystem.

The project values usefulness over novelty.

⸻

Why Local Matters

Local execution is a strategic choice.

Cloud services can disappear, change pricing, change moderation policies, remove models, or alter behavior without notice.

The project should prefer architectures where knowledge, workflows, prompts, and capabilities remain under local control whenever practical.

Provider dependencies should be treated as replaceable execution layers rather than foundations.

The durable asset is knowledge and workflow understanding, not a specific vendor or model.

⸻

Design Principles

Evidence Before Conclusions

Facts and hypotheses are different things.

When debugging:

* Record proven facts.
* Record assumptions separately.
* Do not treat hypotheses as conclusions.
* Reopen proven areas only when new evidence appears.

The evidence tree matters more than the theory.

⸻

Follow The Task To The Door

Complete the active task before opening new work.

Avoid solving adjacent problems while the current problem remains unresolved.

A task is complete when the user-visible outcome is achieved, not when a plausible explanation exists.

⸻

Reduce Operator Friction

Humans should not waste cycles.

Repeated manual steps become bugs.

The system should move toward:

* One trusted launch path.
* One trusted stop path.
* One trusted status path.
* One trusted logging path.

Operational simplicity is a feature.

⸻

Shape Rails, Don’t Micromanage

The goal is not to control every output.

The goal is to create conditions that produce better outputs.

Prefer:

* guidance
* examples
* skills
* references

Over:

* endless prohibitions
* giant prompt lists
* hundreds of special-case rules

⸻

Positive Nudging Over Restriction

When behavior needs adjustment, prefer showing the desired direction.

Example:

Instead of:

“Never use purple lighting.”

Prefer:

“Explore broader lighting approaches.”

The objective is flexibility, not obedience.

⸻

Preserve Creativity

Overfitting destroys usefulness.

Every symptom-specific rule increases rigidity.

The project should resist the temptation to patch every undesirable output with another permanent instruction.

Creativity should remain available.

⸻

Knowledge Architecture

Skills Over Giant Prompts

Knowledge should eventually be separated into focused domains.

Examples:

* Z-Image
* Visual identity
* Apple administration
* Intune
* Housing providers
* MDM policy creation

Skills should be maintainable independently.

⸻

Notebook / Wiki Direction

The likely future architecture is a collection of editable knowledge pages.

Each skill owns its own knowledge.

Benefits:

* easier maintenance
* less prompt pollution
* targeted updates
* gradual growth

The notebook becomes a memory layer rather than a monolithic prompt.

⸻

Accumulated Capability

Lisa should improve by accumulating knowledge and tools.

Examples discussed:

* image workflow expertise
* MDM expertise
* housing provider expertise
* tool generation
* scraper generation

Growth should happen through capability expansion rather than prompt expansion.

⸻

Tool Philosophy

Tools should exist to remove repetitive work.

Long-term examples include:

* provider-specific scraper generation
* workflow creation
* documentation assistance
* trend reasearch
Eventually Lisa should help create some of the tools she repeatedly needs.

The goal is not autonomy.

The goal is leverage.

⸻

Infrastructure Philosophy

Infrastructure must be trustworthy before feature debugging begins.

If startup state, logging, process management, or runtime state are uncertain, feature debugging becomes unreliable.

A trustworthy system:

* starts predictably
* stops predictably
* reports state accurately
* exposes logs clearly

Runtime ambiguity creates false bugs.

⸻

Lessons Learned

Integration Bugs Live At The Seams

Most difficult failures were not inside components.

They occurred between components.

Examples:

* frontend ↔ voice
* bot ↔ retrieval
* startup ↔ runtime state
* tool ↔ execution layer

The seams deserve instrumentation.

⸻

Memory Pressure Shapes Architecture

Local AI is often memory engineering.

Architecture must respect hardware limits.

Model loading, image generation, retrieval, voice, and tooling all compete for resources.

Hardware constraints influence software design.

⸻

Cloud Dependencies Are Temporary - so far

External providers are useful.

They are not permanent.

Systems should be designed assuming providers will eventually change, disappear, or become unsuitable.

⸻

Future Directions

Potential areas of exploration:

* self-maintained skill notebooks
* workflow learning
* tool creation
* provider-specific scraper generation
* erotic story writing
* service orchestration
* image workflow expertise
* additional personas

Examples discussed:

* James, the Irish fly-fishing expert
* domain-specific specialists
* workflow-focused assistants

These remain experiments rather than commitments.

⸻

Final Principle

Lisa should become more capable without becoming more rigid.

Capability growth is success.

Complexity growth is not.