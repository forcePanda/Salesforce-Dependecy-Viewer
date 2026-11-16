# SFDV Enterprise Dependency Fixture

Synthetic Salesforce DX-style project with intentionally connected and disconnected metadata.
Created for test analysis only (not guaranteed deployable into an arbitrary Salesforce org).
The canonical expectations live in `expected-dependencies.json` and the test suite.

* `force-app` is the only source folder.
* `outside-source` contains deliberately excluded metadata.
* Metadata API type coverage is representative rather than exhaustive.
