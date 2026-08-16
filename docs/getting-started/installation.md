# Installation

## Prerequisites

Install the tools required to create and build Mule projects:

- Node.js 18 or later
- Java 17 or a Mule-supported Java version for the selected runtime
- Maven
- Git
- Anypoint Studio for local Mule application development

## Install MuleForge

```bash
npm install -g muleforge
```

Verify:

```bash
muleforge --version
muleforge doctor
```

`muleforge doctor` is intended to identify missing local prerequisites before project generation or build operations.

## Development installation

To work on MuleForge itself:

```bash
git clone https://github.com/Narsing-s/muleforge.git
cd muleforge
npm install
npm test
```
