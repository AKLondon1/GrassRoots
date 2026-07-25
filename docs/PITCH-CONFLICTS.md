# Pitch-conflict algorithm

Facility units form a hierarchy: venue → full pitch → subdivision. A candidate booking is invalid when its buffered time range overlaps an active booking on the same unit, an ancestor or a descendant. Capacity, permitted format, closure, inspection and maintenance status are checked after hierarchy conflicts.

Alternatives are deterministic: compatible, open units are scored by exact size, same venue, time displacement and unused capacity, then sorted stably. The database exclusion/validation boundary is authoritative; drag-and-drop is only one UI. Keyboard and list alternatives must expose the same operation.

Pitch closure identifies affected canonical event instances. Cancellation or relocation creates a change summary, updates communications and calendar feeds, and retains an audit trail.
