locals {
  worker_user_data = <<TFEOF
#!/bin/sh

# Mount external volume as docker lib

while true; do
  sleep 1
  test -e /dev/xvdh && break
done

mkfs -t ext4 /dev/xvdh
mkdir /mnt/data
cp /etc/fstab /etc/fstab.bak
echo '/dev/xvdh /mnt/data ext4 defaults,nofail 0 0' >> /etc/fstab
mount -a

mkdir -p /mnt/data/var/lib/docker
mkdir -p /mnt/data/var/lib/containerd
ln -s /mnt/data/var/lib/docker /var/lib/docker
ln -s /mnt/data/var/lib/containerd /var/lib/containerd

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

curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -
# Complete fingerprint: 9DC8 5822 9FC7 DD38 854A E2D8 8D81 803C 0EBF CD88
sudo apt-key fingerprint 0EBFCD88

sudo add-apt-repository \
   "deb [arch=amd64] https://download.docker.com/linux/ubuntu \
   $(lsb_release -cs) \
   stable"

sudo apt-get update
sudo apt-get install -y docker-ce

apt-get install -y nfs-common
mkdir -p /var/efs
mount -t nfs -o nfsvers=4.1,rsize=1048576,wsize=1048576,hard,timeo=600,retrans=2,noresvport ${aws_efs_mount_target.block_storage_mount_point.dns_name}:/ /var/efs

apt-get install -y python-pip && pip install awscli

while true; do
    docker swarm join --token $(aws secretsmanager get-secret-value --region ${var.region} --secret-id swarm-token-${var.name}-worker-${var.region} --output text --query SecretString) ${aws_instance.manager.private_ip} && break
    sleep 5
done

TFEOF
}

resource "aws_instance" "worker" {
  count = "${var.instance_count}"
  ami = "${data.aws_ami.ubuntu-18_04.id}"
  instance_type = "${var.instance_type}"
  security_groups = ["${aws_security_group.swarm.id}"]
  key_name = "${aws_key_pair.deployer.key_name}"
  iam_instance_profile = "${aws_iam_instance_profile.swarm_worker.name}"
  subnet_id = "${module.vpc.first_subnet.id}"

  user_data = "${local.worker_user_data}"

  tags = {
    Name = "${var.name}-swarm-worker-${count.index}"
  }
}

resource "aws_ebs_volume" "worker_storage" {
  count = "${var.instance_count}"
  size = 50
  availability_zone = "${element(aws_instance.worker.*.availability_zone, count.index)}"

  tags = {
    Name = "docker-storage"
  }
}

resource "aws_volume_attachment" "worker_storage_attachment" {
  count = "${var.instance_count}"
  device_name = "/dev/sdh"
  force_detach = true
  volume_id = "${element(aws_ebs_volume.worker_storage.*.id, count.index)}"
  instance_id = "${element(aws_instance.worker.*.id, count.index)}"
}
