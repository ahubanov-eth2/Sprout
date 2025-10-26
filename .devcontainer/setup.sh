#!/bin/bash
set -e

git config --global url."https://x-access-token:${GITHUB_TOKEN}@github.com/".insteadOf "git@github.com:"
git submodule update --init --recursive
export DYNAMIC_REPO_PATH=${DYNAMIC_REPO_PATH}
git clone https://x-access-token:${GITHUB_TOKEN}@github.com/${DYNAMIC_REPO_PATH}.git data/project-repository

if [ ! -d "data/project-repository" ]; then
    echo "Error: Failed to clone repository into data/project-repository."
    exit 1
fi

cd data/project-repository
git checkout ${PARENT_COMMIT}

# cd webapp # TODO: make this generic
# npm install --ignore-scripts # TODO: make this generic