# SLCyber-Inspired Caido Plugin

This plugin is inspired by [tools.slcyber.io](https://tools.slcyber.io). It contains two tools: Surf (an SSRF target discovery tool) and Wordlists (custom wordlists from SLCyber downloaded directly into Caido).

## Surf Module

The **Surf** module allows you to scan a set of domains and identify potential SSRF (Server-Side Request Forgery) candidates. It leverages proven scanning logic from SLCyber's Surf but is tailored for Caido's extensible ecosystem.

**Usage:**
- Enter one or more domains you wish to probe.
- Configure the scanning timeout and concurrency as required.
- Start the scan; progress and real-time results will be displayed within Caido.
- On completion, view categorized results (internal/external hosts) to use as wordlists within Caido.


## Wordlists Module

The **Wordlists** module enables you to easily browse and download curated wordlists for use in security testing and reconnaissance. These wordlists are fetched from SLCyber's maintained API.

**Usage:**
- Browse by category (Automated, Kiterunner, Manual, Technologies) to find suitable wordlists.
- Filter by extensions or search by filename.
- Download wordlists directly into your Caido instance.