## What CivicMind routes

CivicMind sends each accepted complaint to one department, or leaves it unassigned when no rule matches.

Roads & Infrastructure handles potholes, damaged roads, footpaths, and other road-surface failures. The category key is road.

Water Supply handles pipeline leakage, water shortages, contamination, and low pressure. The category key is water_supply.

Sanitation handles garbage accumulation, missed waste collection, overflowing bins, sewage, and public toilets. The category keys are waste and sewage.

Street Lighting handles broken street lights, damaged lighting poles, and lighting failures. The category key is streetlight.

Drainage handles blocked drains, waterlogging, flooding, and stormwater drainage. The category key is drainage.

Public Health handles mosquito breeding, dengue risk, pollution, epidemics, and hygiene hazards. The category key is pollution.

Traffic handles traffic signal faults, road obstructions, and traffic infrastructure. The category key is traffic.

Parks & Gardens handles fallen trees, dangerous trees, park maintenance, and damaged public gardens. The category key is trees_parks.

Building & Encroachment handles illegal encroachments, illegal construction, and unsafe structures. The category key is encroachment.

Public Safety handles exposed wires, live wires, and other urgent hazards in public space. The category key is public_safety.

If the text does not match a category or one of those phrases, the incident stays unassigned. An administrator can move it to the correct desk. A department authority can update only incidents already assigned to that department.

## Duplicate complaints

A new report joins an existing incident only when three measurements all pass. Semantic similarity must be at least 0.80. The report must be within 500 meters. The time gap must be within 72 hours. If any one of those fails, CivicMind creates a new incident and shows which measurement failed. Individual reports are kept either way. Joining an incident does not delete the citizen's complaint.

## Priority

Severity stays a label: low, medium, high, or critical. Priority is a separate number from 0 to 10.

Priority = 0.30 times impact + 0.25 times safety risk + 0.20 times report volume + 0.15 times location + 0.10 times duration.

Impact depends on the category. Public safety is 10, drainage is 9, water supply and sewage are 8, road and traffic are 7, street lighting and pollution are 6, waste and encroachment are 5, trees and parks are 4, and anything else is 3.

Safety risk follows severity: low is 2, medium is 5, high is 8, and critical is 10.

Report volume follows how many complaints are stored on the incident: 1 report scores 1, 2 reports score 3, 3 to 5 score 6, 6 to 10 score 8, and 11 or more score 10.

Location scores 8 when the pin is inside Mumbai and an area name is known, 5 when the pin is inside Mumbai without an area name, and 3 when the pin is outside Mumbai.

Duration scores 1 under 12 hours, 3 under 48 hours, 5 under 7 days, 8 under 30 days, and 10 after that. A resolved incident stops the clock at the resolution time.

A score of 8 or above is treated as urgent for sorting and alerts. The score is recalculated when a report is added or the status changes, and it is also recomputed when an authority opens the incident so the duration band stays current.

## Status

An incident moves from open to in progress to resolved. A citizen can confirm a resolution or ask for it to be reopened. Reopening returns the incident to open and keeps the earlier reports. Every status change, note, reassignment, and piece of resolution evidence is written to the audit timeline.

## What a resolution needs

Before an incident is marked resolved, the authority writes what was done in at least a short sentence. A photo of the repaired site can be attached and is shown beside the citizen's original photo. The citizen then confirms the result or explains why it is still unresolved.
