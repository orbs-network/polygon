locals {
  manager_user_data = <<TFEOF
#!/bin/sh

# Mount external volume as docker lib

while true; do
  sleep 1
  test -e /dev/xvdh && break

  if [ -e /dev/xvdh ]; then
    export DISK=/dev/xvdh
    break
  fi

  if [ -e /dev/nvme1n1 ]; then
    export DISK=/dev/nvme1n1
    break
  fi
done

if [ ! -e /mnt/data ]; then
  mkfs -t ext4 $DISK
  mkdir /mnt/data
  cp /etc/fstab /etc/fstab.bak
  echo "$DISK /mnt/data ext4 defaults,nofail 0 0" >> /etc/fstab
  mount -a

  mkdir -p /mnt/data/var/lib/docker
  mkdir -p /mnt/data/var/lib/containerd
  ln -s /mnt/data/var/lib/docker /var/lib/docker
  ln -s /mnt/data/var/lib/containerd /var/lib/containerd
fi

# Sysctl

sysctl -w net.core.somaxconn=128000

# Remove old instances of Docker which might ship with ubuntu
apt-get remove docker docker-engine docker.io

apt-get update
apt-get install \
    apt-transport-https \
    ca-certificates \
    curl \
    software-properties-common

curl -fsSL https://download.docker.com/linux/ubuntu/gpg | apt-key add -
# Complete fingerprint: 9DC8 5822 9FC7 DD38 854A E2D8 8D81 803C 0EBF CD88
apt-key fingerprint 0EBFCD88

add-apt-repository \
  "deb [arch=amd64] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) \
  stable"

apt-get update
apt-get install -y docker-ce daemontools

echo "Downloading Boyar from ${var.boyarUrl}"
curl -L ${var.boyarUrl} -o /usr/bin/boyar && chmod +x /usr/bin/boyar

apt-get install -y python-pip && pip install awscli

docker swarm init

apt-get install -y nfs-common
mkdir -p /var/efs
mount -t nfs -o nfsvers=4.1,rsize=1048576,wsize=1048576,hard,timeo=600,retrans=2,noresvport ${aws_efs_mount_target.block_storage_mount_point.dns_name}:/ /var/efs

mkdir -p /opt/orbs
aws secretsmanager get-secret-value --region ${var.region} --secret-id ${local.secret_name} --output text --query SecretBinary | base64 -d > /opt/orbs/keys.json

# Retrive SSL keys if possible

mkdir -p /opt/orbs/ssl

export SSL_CERT_PATH=/opt/orbs/ssl/ssl-cert.pem
export SSL_PRIVATE_KEY_PATH=/opt/orbs/ssl/ssl-private-key.pem

aws secretsmanager get-secret-value --region ${var.region} --secret-id ${local.ssl_cert_secret_name} --output text --query SecretBinary | base64 -d > $SSL_CERT_PATH

aws secretsmanager get-secret-value --region ${var.region} --secret-id ${local.ssl_private_key_secret_name} --output text --query SecretBinary | base64 -d > $SSL_PRIVATE_KEY_PATH

# Save docker swarm token to secretsmanager

aws secretsmanager create-secret --region ${var.region} --name swarm-token-${var.name}-worker-${var.region} --secret-string $(docker swarm join-token --quiet worker) || aws secretsmanager put-secret-value --region ${var.region} --secret-id swarm-token-${var.name}-worker-${var.region} --secret-string $(docker swarm join-token --quiet worker)

# Remove access to secrets

aws iam detach-role-policy --role-name orbs-${var.name}-manager --policy-arn ${aws_iam_policy.swarm_manager_secrets.arn}

aws iam detach-role-policy --role-name orbs-${var.name}-manager --policy-arn ${aws_iam_policy.swarm_detach_role_policy.arn}

# Log into docker hub

$(aws ecr get-login --no-include-email --region us-west-2)

echo '0 * * * * $(/usr/local/bin/aws ecr get-login --no-include-email --region us-west-2)' > /tmp/crontab
crontab /tmp/crontab

# Wait for everyone to join the swarm
while true; do
    [ $(docker node ls --format '{{.ID}} {{.ManagerStatus}}' | grep -v Leader | wc -l) -ge ${var.instance_count} ] && break
    sleep 15
done

# Remove access to worker secrets

aws iam detach-role-policy --role-name orbs-${var.name}-worker --policy-arn ${aws_iam_policy.swarm_worker_secrets.arn}

# Label workers
for n in $(docker node ls --format '{{.ID}} {{.ManagerStatus}}' | grep -v Leader | cut -d" " -f1); do
    docker node update --label-add worker=true $n
done

# Label leader as manager
for n in $(docker node ls --format '{{.ID}} {{.ManagerStatus}}' | grep Leader | cut -d" " -f1); do
    docker node update --label-add manager=true $n
done

# Extract topology from Ethereum if possible
if [ ! -z "${var.ethereum_topology_contract_address}" ]; then
  export ETHEREUM_PARAMS="--ethereum-endpoint ${var.ethereum_endpoint} --topology-contract-address ${var.ethereum_topology_contract_address}"
fi

# Provision SSL if possible
if [ ! -z "$(cat $SSL_CERT_PATH)" ] && [ ! -z "$(cat $SSL_PRIVATE_KEY_PATH)" ]; then
  export SSL_PARAMS="--ssl-certificate $SSL_CERT_PATH --ssl-private-key $SSL_PRIVATE_KEY_PATH"
fi

export MANAGEMENT_CONFIG_PATH=/opt/orbs/management-config.json
cat <<-EOF > $MANAGEMENT_CONFIG_PATH
${var.boyar_management_config}
EOF

export MANAGEMENT_CONFIG_PARAMS="${var.boyar_management_config == "" ? "" : "--management-config $MANAGEMENT_CONFIG_PATH"}"

# Install supervisord to keep Boyar alive even after a restart to the EC2 instance
apt-get install -y supervisor tar daemontools

mkdir -p /var/efs/boyar-logs/
mkdir -p /var/efs/boyar-status/

ln -s /var/efs/boyar-logs/current /var/log/boyar.log

if [ ! -z "${var.bootstrap_url}" ]; then
  export BOOTSTRAP_PARAMS="--config-url ${var.bootstrap_url}"
fi

if [ "${var.boyarAutoUpdate}" = "true" ]; then
  export AUTOUPDATE_PARAMS="--auto-update --shutdown-after-update"
fi

export BOYAR_WRAPPER_PATH=/opt/orbs/boyar.sh
cat <<-EOF > $BOYAR_WRAPPER_PATH
#!/bin/bash

trap "kill -- -$$" EXIT

multilog_err=1
multilog_cmd="multilog s16777215 n32 /var/efs/boyar-logs/"

while [[ "\$multilog_err" -ne "0" ]]; do
    sleep 1
    echo "boyar logging pre checks..." | \$multilog_cmd
    multilog_err=\$?
done

echo "Running boyar..."

exec /usr/bin/boyar --keys /opt/orbs/keys.json --max-reload-time-delay 0m --bootstrap-reset-timeout 30m --status /var/efs/boyar-status/status.json $BOOTSTRAP_PARAMS $ETHEREUM_PARAMS $SSL_PARAMS $MANAGEMENT_CONFIG_PARAMS $AUTOUPDATE_PARAMS 2>&1 | \$multilog_cmd
EOF

chmod +x $BOYAR_WRAPPER_PATH


echo "[program:boyar]
command=$BOYAR_WRAPPER_PATH
autostart=true
autorestart=true
environment=HOME=\"/root\"
stdout_logfile=/var/efs/boyar-logs/supervisor.stdout
redirect_stderr=true
stdout_logfile_maxbytes=10MB" >> /etc/supervisor/conf.d/boyar.conf

curl -L https://github.com/prometheus/node_exporter/releases/download/v${var.node_exporter_version}/node_exporter-${var.node_exporter_version}.linux-amd64.tar.gz -o /home/ubuntu/node_exporter.tar.gz
cd /home/ubuntu
tar xvfz node_exporter.tar.gz && mv node_exporter-0.18.1.linux-amd64/node_exporter .
chmod +x node_exporter
rm -f node_exporter.tar.gz

echo "[program:node_exporter]
command=/home/ubuntu/node_exporter --collector.ntp --collector.tcpstat --collector.supervisord
autostart=true
autorestart=true
stderr_logfile=/var/log/node_exporter.err.log
stdout_logfile=/var/log/node_exporter.log" >> /etc/supervisor/conf.d/node_exporter.conf

supervisorctl reread && supervisorctl update

TFEOF
}

resource "aws_instance" "manager" {
  ami = "${data.aws_ami.ubuntu-18_04.id}"
  instance_type = "${var.instance_type}"
  security_groups = ["${aws_security_group.swarm.id}"]
  key_name = "${aws_key_pair.deployer.key_name}"
  subnet_id = "${module.vpc.first_subnet.id}"
  iam_instance_profile = "${aws_iam_instance_profile.swarm_manager.name}"

  user_data = "${local.manager_user_data}"

  tags = {
    Name = "${var.name}-swarm-manager"
  }
}

resource "aws_ebs_volume" "manager_storage" {
  size = 50
  availability_zone = "${aws_instance.manager.availability_zone}"

  tags = {
    Name = "docker-storage-${var.name}-manager"
  }
}

resource "aws_volume_attachment" "manager_storage_attachment" {
  device_name = "/dev/sdh"
  force_detach = true
  volume_id = "${aws_ebs_volume.manager_storage.id}"
  instance_id = "${aws_instance.manager.id}"
}
