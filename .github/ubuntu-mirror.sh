#!/usr/bin/env bash
set -euo pipefail

# Hosted runners may list their regional mirror directly in deb822 sources.
for source in /etc/apt/apt-mirrors.txt /etc/apt/sources.list /etc/apt/sources.list.d/ubuntu.sources; do
    if [[ -f "$source" ]]; then
        sudo sed -Ei 's#https?://(azure\.|[a-z0-9-]+\.ec2\.)archive\.ubuntu\.com/ubuntu#https://archive.ubuntu.com/ubuntu#g' "$source"
    fi
done
