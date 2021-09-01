# Orbs Polygon

&nbsp;

**Important: If you're a validator trying to launch an Orbs node - please read the [instructions here](https://github.com/orbs-network/validator-instructions/blob/master/public/orbs-public-beta.md).**

&nbsp;

Polygon generates Terraform code to provision the required AWS resources so that you have a running Orbs node. Once done, the following illustration highlights the created resources expected in your AWS account.

![](diagram.png)

Note: Orbs Polygon is a tool which is very similar to [Orbs Nebula](https://github.com/orbs-network/nebula). Polygon is the up-to-date tool for the Orbs V2 network replacing Nebula that only supports the deprecated Orbs V1 network.

## Orbs node keypair and Elastic IP

Prior to running polygon to provision your blockchain node, you need to perform 2 tasks:
* Generate an `ECDSA` keypair which will be used by your node (and is required to run polygon)
* Allocate an Elastic IP in your AWS account (in the region in which you plan to run your node obviously)
* Your public key from the first bullet and the Elastic IP should have been provided to Orbs prior
to running this tool for your node to be able to sync correctly to the Orbs Network.

## Prerequisities
For Polygon to work properly you should have the following setup:
- an SSH public key (which is also loaded by the ssh-agent)
  if you have one set at `~/.ssh/id_rsa.pub` you're good to go!
  you can check this by running the following in your terminal:
  `$ cat ~/.ssh/id_rsa.pub`
- Orbs key pair
- You need to install Terraform and AWS CLI (all currently released versions are supported)
- Terraform can be installed using tfenv: `brew install tfenv` on Mac. Polygon has been tested with Terraform v1.0.5
- AWS CLI can be installed using: `brew install awscli` on Mac. Polygon is verified to work on AWS CLI v2.2.9
- an AWS Credentials profile set correctly
  See more [here](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-profiles.html)
- [Node.js](https://nodejs.org/en/) should be installed version 8 or above

## Installation

Polygon easily integrates into your terminal by installing the NPM package globally

    $ npm install @orbs-network/polygon -g

or if using yarn

    $ yarn global add @orbs-network/polygon

## Creating a node

Creating a node with the CLI is as simple as this:

    $ polygon create --name your-node-name \
                  --orbs-address d27e2e7398e2582f63d0800330010b3e58952ff6 \
                  --orbs-private-key 87a210586f57890ae3642c62ceb58f0f0a54e787891054a5a54c80e1da418253
                  --public-ip 1.2.3.4
                  --region us-west-2

    Your node was created successfully!
    Provided below is the address of your manager node public IP
    The manager IPv4 is: 1.2.3.4

    Your node name should be used when wanting to destroy/upgrade
    Node name:
    your-node-name

    Example usage:
    polygon destroy --name your-node-name

    Please allow time now for your node to finish syncing with the Orbs network
    No further actions required at this point

or if you wish to use a less terminal verbose style , you can create a JSON file naming
the required arguments. Let's assume the following `your-node-name.json` file and content:

    {
        "name": "your-node-name",
        "awsProfile": "default",
        "sshPublicKey": "~/.ssh/id_rsa.pub",
        "orbsAddress": "d27e2e7398e2582f63d0800330010b3e58952ff6",
        "orbsPrivateKey": "87a210586f57890ae3642c62ceb58f0f0a54e787891054a5a54c80e1da418253", 
        "publicIp": "1.2.3.4",
        "region": "us-west-2",
        "nodeSize": "t3.medium",
        "nodeCount": 2,
        "incomingSshCidrBlocks": ["$MY_IP_ADDRESS/32"]
    }

and then we can run the following in our terminal:

    $ polygon create -f your-node-name.json

    ....
    [Lots of Terraform output will come out here]
    ....

    Your node was created successfully!
    Provided below is the address of your manager node public IP
    The manager IPv4 is: 1.2.3.4

    Your node name should be used when wanting to destroy/upgrade
    Node name:
    your-node-name

    Example usage:
    polygon destroy --name your-node-name

    Please allow time now for your node to finish syncing with the Orbs network
    No further actions required at this point

You should consider using `git` to keep this file up to date and safely backed up.

## Destroying a node

Destroying is even easier and requires even less arguments

    $ polygon destroy --name your-node-name

    ....
    [Lots of Terraform output will come out here]
    ....

    Your node has been successfully destroyed!


At the moment - upgrading the node is not possible directly through Polygon. If you wish to upgrade - please destroy and re-create your node.

## `node.json` file reference

| Option                | Mandatory | Type    | Description                                                                                                   | Default             |
|-----------------------|-----------|---------|---------------------------------------------------------------------------------------------------------------|---------------------|
| `orbs-address`        |Yes| string  | Orbs node address - attained from Orbs or from our DKG process                                                |                     |
| `orbs-private-key`    |Yes| string  | Orbs node private key - attained from Orbs or from our DKG process                                            |                     |
| `name`                |Yes| string  | name your node! in case non supplied defaults to a random name                                       | Random UUID         |
| `aws-profile`         |Optional| string  | which aws profile name to use when provisioning. Strongly recommended instead of AWS keys for better security | `default`           |
| `testnet`             |Optional| boolean | If supplied, the node will join the Orbs Network testnet instead of the mainnet                      | `false`             |
| `public-ip`           |Mandatory| string  | if you wish to attach a static pre-existing EC2 Elastic IP                                                    |                     |
| `node-count`          |Optional| number  | The amount of worker nodes to deploy (the more - the more vChains you can handle)                             | 2                 |
| `node-size`           |Optional| string  | The worker node instance size to use                                                                          | `t2.medium`         |
| `region`              |Optional| string  | The AWS region to deploy to                                                                                   | `us-east-1`         |
| `ssh-public-key`      |Optional| string  | Path to the SSH public key to provision the EC2 machines with                                                 | `~/.ssh/id_rsa.pub` |
| `boyarAutoUpdate`      |Optional| boolean  | Enables automatic updates of Boyar                                                 | `false` |

**FIXME** update the file reference

## Internal workflow

An Orbs node is currently designed to run on top of AWS. If you want to run in on your own infrastructure, you can check out [Boyar](https://github.com/orbs-network/boyarin), which is a tool that runs the node on top of Docker Swarm. To provision resources on AWS Polygon needs:

* AWS Access/secret pair
* Orbs key pair (Obtained through a process called DKG)
* SSH Key (to be installed on the machines provisioned with this tool)

Polygon will create a new folder within your machine and will generate [Terraform](https://www.terraform.io/) scripts to go into
these folder which will be used to deploy a new node.

All parameters can be customized via `node.json` file.

Polygon then runs the generated `Terraform` code, provisioning the entire infrastructure required.

AWS machine bootstrap script will:

* Update the server's packages and check for any OS-level security packages which might require updating.
* Install all the required software into the servers provisioned for Orbs to run.
* Join a Docker Swarm cluster.
* Startup `boyar` that uses Docker Swarm to run `virtual chains` and other services
* at this point `boyar` will start running `virtual chains` on your `node` and have them sync with the network

At this point you should be good! Polygon has setup the `node` for you.

### Prerequisites

* Make sure [Node.js](https://nodejs.org/en/download/) is installed (version 8 or later, we recommend version 10 and up).

  > Verify with `node -v`

### Test

* Running the tests require an active AWS credentials set appropriately in the following environment variables

```
 $ export AWS_ACCESS_KEY_ID='YOUR_AWS_ACCESS_KEY'
 $ export AWS_SECRET_ACCESS_KEY='YOUR_AWS_SECRET_KEY'
```

* Once that is in place, and within the same terminal navigate you can clone this repository from GitHub by running the following

```
 $ git clone https://github.com/orbs-network/polygon
```

* Install the project's dependencies

```
 $ cd polygon && npm install
```

* and finally, run the tests by running
```
  $ npm test
```

Please note that this command will run all of the provided tests which at the moment are end to end and unit tests.

### Inspecting your Orbs Node's Health and metrics

Please consult [here](https://github.com/orbs-network/validator-instructions)

## License

MIT
