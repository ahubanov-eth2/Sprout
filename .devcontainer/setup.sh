#!/bin/bash
set -e

git config --global url.\"https://x-access-token:${GITHUB_TOKEN}@github.com/\".insteadOf \"git@github.com:\"
git submodule update --init --recursive
export DYNAMIC_REPO_PATH=${DYNAMIC_REPO_PATH:-mattermost/mattermost}
git clone https://x-access-token:${GITHUB_TOKEN}@github.com/${DYNAMIC_REPO_PATH}.git data/project-repository
cd data/project-repository
git checkout PARENT_COMMIT=${PARENT_COMMIT:-632b231283}
cd \"webapp\" // TODO: make this generic 
npm install // TODO: make this generic 