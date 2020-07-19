# Publishing Polygon Versions

> Note: This section is only relevant to Nebula maintainers

## NPM tags we use

* `latest` - the stable release, used by validators.

* `experimental` - unstable dev release, used by developers and core team.


To view current versions for both tags, visit [this page](https://www.npmjs.com/package/@orbs-network/polygon?activeTab=versions) or run in CLI:

```
npm dist-tag ls @orbs-network/polygon
```

## Installing the stable version (latest)

```
npm install @orbs-network/polygon
```

## Installing the experimental version

```
npm install @orbs-network/polygon@experimental
```

## Publishing new versions under these tags

See https://docs.npmjs.com/cli/dist-tag
