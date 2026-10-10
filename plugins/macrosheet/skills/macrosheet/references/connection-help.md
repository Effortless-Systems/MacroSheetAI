# Connection, Update And Refresh Help

Use this reference only from an accessible installed MacroSheet skill package,
for setup, user-requested help or an observed relevant failure. Follow explicit
user choices and host authorization. Do not run background update checks or load
this reference through `get_tracking_guide`; it has no hosted topic.

## Google Setup

1. Inspect the host's actual Google tools for the requested operation: discovery,
   copy/creation, native metadata/cell reads, bounded row reads, writes and readback
   as needed. Use an available authorized connection directly. Do not search for
   or suggest a plugin when its existing tools can complete the request.
2. If required access is missing, briefly explain it in user terms, for example:
   “Connect Google Drive so I can create and save your tracker.” Installation,
   authentication and native Sheets capabilities are separate checks.
   If the host already identifies an installed connection needing sign-in or
   missing Sheet operations, go directly to the recovery guidance in step 5.
3. If the host exposes Plugin Management discovery, inspect its actual schemas
   and use `search_plugins` with the concise query “Google Drive”. Select the
   matching eligible Google Drive plugin by its exact returned identifier; do
   not hardcode an account-specific ID or select an unrelated search result.
4. Use `suggest_plugins` only for an eligible uninstalled plugin, at most once
   per turn. Do not suggest installed or already-pending plugins, or repeat a
   suggestion made within seven days unless the user explicitly requests
   installation. A native suggestion offers setup; it does not install,
   authenticate or grant access by itself.
5. For an installed plugin with missing/expired authentication, guide the user
   to reconnect the intended account through the host's Plugins/Apps settings.
   Missing native Sheets operations are a capability blocker, not proof that
   reinstalling or signing in again will fix them. Explain workspace/admin
   restrictions without trying to bypass them.
6. If discovery/suggestions are absent, fail, or return no eligible match, use
   the host's Plugins/Apps settings or supported plugin directory as the manual
   route. Do not claim that the whole service is unavailable from a failed search.
   Continue independent help or numeric calculations; never invent connection
   success, a credential prompt, browser workaround or alternate Google backend.
7. Let the user finish the native installation/sign-in flow. Recheck the intended
   account and required Google operations only after the connection changes.
   Catalog `installed`/enabled state alone does not prove authentication or Sheet
   access. Continue the existing tracker-selection/setup rules once verified;
   opening setup or accepting a plugin suggestion does not authorize a Sheet write.

## Recovery

Preserve the account/tracker binding, accepted proposal, entry IDs and any verified
save. Follow [write failure recovery](../SKILL.md#write-failure-recovery): safety
rejection, pending host approval, provider authentication/access failure, invalid
requests and uncertain execution require different remedies. A file-access denial
needs access to that same tracker, not installation or a replacement workbook.

Resolve uncertain writes by readback before any permitted retry. Connection changes
or refreshed instructions do not authorize another write, revive a declined meal
or alter accepted values. Changed portions/values or destinations follow the
existing confirmation rules. A failed dashboard never repeats a saved meal.

Leave authentication and permission changes to the host's controls. Do not change
permission defaults or automatically uninstall/reinstall plugins as a repair, and
never request passwords, tokens or API keys. Report the observed blocker; retry
only after its supported resolution, without repeated discovery/reconnect loops.

## Updates And Refresh

Clarify which kind of refresh the user needs from the request and observed failure;
ask only if it remains ambiguous. Keep product explanations short:

| Request | Supported route and evidence |
| --- | --- |
| Update the installed MacroSheet package/skill | Guide the host's supported update/install controls. Current Plugin Management tools expose no package updater; do not automate an update or invent its status. Verify the installed version only from available host/package evidence. Updating server code or fetching a guide does not update an installed package. |
| Refresh MCP tools/connection | Guide the host's exposed connection controls when tools or their definitions are stale. Current Plugin Management tools expose no MCP refresh operation. Connection refresh does not install this skill, authorize Google or prove a newer service is deployed. |
| Refresh hosted tracking instructions | Follow [Hosted Guide Freshness](../SKILL.md#hosted-guide-freshness), retaining expiry and one-fetch recovery limits. A successful fetch refreshes instructions only. |
| Refresh Day So Far/Weekly data | Follow [presentation.md](presentation.md): read fresh bounded data for the originating account/tracker and selected dates, then supply the verified numeric snapshot to the renderer. Reuse no stale totals and write no meal. |

Claim updated, connected, saved or refreshed only for the specific result verified.
Do not infer end-to-end success from a catalog result, a tool acknowledgement or a
render acceptance. Installing/connecting a plugin never confirms pending meals.
