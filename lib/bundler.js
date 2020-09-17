const fs = require('fs');
const { resolve, relative, dirname } = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const babel = require('@babel/core');

class Bundler {
    entry;
    output;
    rootDir;
    /**
     * @param {Object} options 构造函数参数
     * @param {String} options.entry 入口路径
     * @param {Object} options.output 输出配置
     * @param {String} options.output.path 输出目录
     * @param {String} options.output.filename 输出生成的文件名
     */
    constructor(options) {
        const { entry, output } = options;
        this.rootDir = process.cwd();
        this.entry = entry || './src/index.js';
        this.output = output || {
            path: './dist',
            filename: 'bundle.js',
        };
    }

    /**
     * @description 解析文件
     * @param {String} fileRelPath 相对项目根目录的相对路径
     * @returns {Object} 解析文件生成依赖、代码及其路径合成的对象
     */
    parseFile(fileRelPath) {
        const { rootDir } = this;
        const fileAbsPath = resolve(rootDir, fileRelPath);
        const dirAbsPath = dirname(fileAbsPath);
        const fileContent = fs.readFileSync(fileAbsPath, 'utf-8');
        const ast = parser.parse(fileContent, {
            sourceType: 'module',
        });
        // 解析依赖，对导入语句进行解析
        const dependencies = {};
        traverse(ast, {
            // 对导入声明进行处理
            ImportDeclaration({ node }) {
                const dep = node.source.value;
                // 根据当前文件所在目录和导入语句计算出依赖文件绝对路径
                const depAbsPath = resolve(dirAbsPath, dep);
                // 根据依赖的绝对路径计算其相对项目根目录的相对路径
                const depRelPath = relative(rootDir, depAbsPath);
                dependencies[dep] = depRelPath;
            },
        });
        // 根据ast生成代码
        const { code } = babel.transformFromAst(ast, null, {
            presets: ['@babel/preset-env'],
        });
        return {
            dependencies,
            code,
            // 全部保存相对项目根目录的路径
            path: fileRelPath,
        };
    }

    /**
     * @description 构建依赖图
     * @param {String} fileRelPath 相对项目根目录的相对路径
     */
    buildDependencyGraph(fileRelPath) {
        const rootFileInfo = this.parseFile(fileRelPath);
        // 递归的对文件依赖进行转换
        const tasks = [rootFileInfo];
        for (let i = 0; i < tasks.length; i++) {
            const fileInfo = tasks[i];
            const { dependencies } = fileInfo;
            // value 保存的是相对项目根目录的路径
            Object.values(dependencies).forEach(
                (dep) => {
                    const depInfo = this.parseFile(dep);
                    // 获取到文件信息后又放入到tasks中，如此下去，全部依赖都会遍历到
                    tasks.push(depInfo);
                }
            );
        }
        // 构建成以相对项目根路径的相对路径为key的对象，方便后续访问
        const graph = {};
        tasks.forEach(
            (fileInfo) => {
                const { dependencies, code, path } = fileInfo;
                graph[path] = {
                    dependencies,
                    code,
                };
            }
        );
        return graph;
    }

    /**
     * @description 生成目标代码
     * @param {String} entry 入口文件
     */
    generateCode(entry) {
        const graph = this.buildDependencyGraph(entry);
        const graphJson = JSON.stringify(graph);
        const code = `
            (function(graph) {
                // 运行一个模块的代码
                function run(module) {
                    // 注入export到内部代码中
                    var exports = {};
                    // 注入require到内部代码中
                    function require(path) {
                        return run(graph[module].dependencies[path]);
                    }
                    // 执行该模块的代码
                    eval(graph[module].code);
                    // 返回导出对象
                    return exports;
                }
                // 运行入口模块的代码
                run('${entry}');
            })(${graphJson});
        `;
        return code;
    }

    /**
     * @description 生成目标代码，并保存到输出目录中
     */
    bundle() {
        const code = this.generateCode(this.entry);
        const distPath = resolve(this.output.path);
        const distExist = fs.existsSync(distPath);
        if (!distExist) {
            fs.mkdirSync(distPath);
        }
        fs.writeFileSync(
            resolve(distPath, `./${this.output.filename}`),
            code,
            {
                flag: 'w',
                encoding: 'utf-8',
            },
        );
    }
}

module.exports = Bundler;