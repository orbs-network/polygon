# SSM lookup (already present)
data "aws_ssm_parameter" "ubuntu_18_04" {
  name = "/aws/service/canonical/ubuntu/server/18.04/stable/current/amd64/hvm/ebs-gp2/ami-id"
}