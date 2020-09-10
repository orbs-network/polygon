variable "application" {
  default = "orbs-network-node"
}

variable "provisionersrc" {
  default = "orbs-network/polygon"
}

variable "vpc_cidr_block" {
  description = "The VPC CIDR address range"

  #https://docs.docker.com/docker-for-aws/faqs/#recommended-vpc-and-subnet-setup
  default = "172.31.0.0/16"
}

variable "instance_type" {
  default = "m4.xlarge"
}

variable "name" {
  default = ""
}

variable "instance_count" {
  default = 2
}

variable "region" {
  default = "us-east-1"
}

variable "aws_profile" {}

variable "node_key_pair" {
  default = "e30K"
}

variable "bootstrap_url" {
  default = ""
}

variable "path_to_ssh_pubkey" {}

variable "ethereum_topology_contract_address" {
  default = ""
}

variable "ethereum_endpoint" {
  default = ""
}

variable "logz_io_http_endpoint" {
  default = "https://listener.logz.io:8071/?token=kATbDvYGTXTOOfyvDYGbWrGdIFBPpvHI&type=prod"
}

variable "boyarUrl" { }

variable "boyar_management_config" {
  default = ""
}

variable "incoming_ssh_cidr_blocks" {
  default = []
  type = "list"
}

variable "ssl_certificate" {
  default = "Cg=="
}

variable "ssl_private_key" {
  default = "Cg=="
}

variable "node_exporter_version" {
  default = "0.18.1"
}

# ancient vesion compatibility start
variable "s3_bucket_name" {
  default = ""
}

variable "s3_boyar_key" {
  default = ""
}

variable "s3_boyar_config_url" {
  default = ""
}

variable "boyar_config_source" {
  default = ""
}
# ancient vesion compatibility end